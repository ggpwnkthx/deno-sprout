// Compile a dev asset (runtime, island, or stylesheet) on demand.
//
// compileDevAsset is the entry point used by the dev server. It
// looks up (or builds) the asset through a process-local
// SingleFlightCache, applies the kind-specific compile strategy,
// and returns the bytes plus content type. The cache invalidates
// on input mtime changes (see cache.ts).
import type { ResolvedConfig } from "@sprout/config";
import { dirname } from "@std/path";
import { encodeHex } from "@std/encoding/hex";
import type { EsbuildBundleInput, EsbuildBundleResult } from "./esbuild.ts";
import { esbuildBundle, VIRTUAL_ENTRY_DIR } from "./esbuild.ts";
import { hashInputs, SingleFlightCache } from "./cache.ts";
import { buildIslandVirtualEntry } from "./virtual_modules.ts";
import { resolveRelativeImport } from "./resolve_relative.ts";

/** The kind of dev asset being compiled. */
export type AssetKind = "runtime" | "island" | "style";

/**
 * Compile input. `mode` is the run mode for cache-key purposes only
 * — both modes go through the same esbuild + Deno loader pipeline.
 * M7 may add prod-only minification toggles; the M6 production build
 * reuses the dev compile path with `mode: "production"`.
 */
export type CompileDevAssetInput = {
  readonly kind: AssetKind;
  readonly id: string;
  readonly entry: string;
  readonly publicPath: string;
  readonly jsxImportSource: string;
  readonly config: ResolvedConfig;
  readonly mode: "development" | "production";
};

/** Result of compiling a dev asset. */
export type CompileDevAssetResult = {
  readonly kind: AssetKind;
  readonly id: string;
  readonly publicPath: string;
  readonly js: Uint8Array;
  readonly map: Uint8Array | null;
  readonly contentType: string;
  readonly hash: string;
  readonly cacheKey: string;
};

// The virtual island entry must live in a SYSTEM tmp dir, not the
// user's project directory. `discoverProject` walks the project's
// islands dir and would otherwise pick a leftover file up as a
// third island, corrupting the manifest. Placing the file under
// `TMPDIR` keeps it out of scope for the project walk. The
// `VIRTUAL_ENTRY_DIR` constant is owned by `esbuild.ts` (the
// filter that drops these paths from the cache's input set also
// lives there) and re-imported here.

async function ensureVirtualEntryDir(): Promise<string> {
  try {
    await Deno.mkdir(VIRTUAL_ENTRY_DIR, { recursive: true });
  } catch (_cause) {
    // best-effort; the subsequent writeTextFile will fail loudly
  }
  return VIRTUAL_ENTRY_DIR;
}

/**
 * Walk up from `startDir` to find the nearest `deno.json` or
 * `deno.jsonc`. Returns the absolute path, or `null` when no
 * config is reachable. Used to anchor the deno-resolver plugin
 * when the entry being bundled lives outside the project
 * directory (the virtual island entry lives in a system tmp dir
 * so `discoverProject` cannot see it).
 */
async function findNearestDenoConfig(startDir: string): Promise<string | null> {
  let dir = startDir;
  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      try {
        const stat = await Deno.stat(`${dir}/${name}`);
        if (stat.isFile) return `${dir}/${name}`;
      } catch (_cause) {
        // not present; try the next name / parent dir
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/** Files in VIRTUAL_ENTRY_DIR older than this are considered stale (24 hours). */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Guards the once-per-process sweep. */
let swept = false;

/** Run once per process: delete stale virtual-entry tmp files on startup. */
/** @internal */
export async function cleanupStaleVirtualEntries(): Promise<void> {
  if (swept) return;
  swept = true;
  try {
    const entries = Deno.readDir(VIRTUAL_ENTRY_DIR);
    const now = Date.now();
    for await (const entry of entries) {
      if (
        !entry.name.startsWith("sprout-island-") ||
        !entry.name.endsWith(".ts")
      ) {
        continue;
      }
      const path = `${VIRTUAL_ENTRY_DIR}/${entry.name}`;
      try {
        const stat = await Deno.stat(path);
        if (stat.mtime && now - stat.mtime.getTime() > STALE_THRESHOLD_MS) {
          await Deno.remove(path);
        }
      } catch (_cause) {
        // Best-effort: the file may have been removed by another process.
      }
    }
  } catch (_cause) {
    // VIRTUAL_ENTRY_DIR may not exist yet; nothing to sweep.
  }
}

// The dev asset pipeline is keyed on `(entry, kind, id, mode, envHash)`.
// Each `createApp` instance has its own project root, and the cache is
// scoped to that root via `getOrCreateCache(root)`. This eliminates
// cross-project contamination when two projects share a process.
//
// The per-root cache is a `SingleFlightCache`: concurrent identical
// compile calls coalesce, and the entry is reused on subsequent calls
// as long as no input mtime has changed.

// 8 = 2x default esbuild concurrency headroom; queues spikes rather
// than spawning unlimited parallel esbuild processes on the main thread.
const DEV_CACHE_MAX_CONCURRENT = 8;

/** Per-project-root dev asset caches keyed by project root. */
const caches = new Map<string, SingleFlightCache>();

/**
 * Get or create the cache for `root`. Each project root gets its own
 * `SingleFlightCache` instance, eliminating cross-project contamination.
 */
function getOrCreateCache(root: string): SingleFlightCache {
  let c = caches.get(root);
  if (c === undefined) {
    c = new SingleFlightCache(DEV_CACHE_MAX_CONCURRENT);
    caches.set(root, c);
  }
  return c;
}

/**
 * Drop every cache entry and remove all cache instances.
 * Intended for test isolation only.
 * @internal
 */
export function resetAllCachesForTesting(): void {
  for (const c of caches.values()) {
    c.clear();
  }
  caches.clear();
}

async function computePublicEnvHash(mode: "development" | "production"): Promise<string> {
  const data = new TextEncoder().encode(`m4-${mode}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out.slice(0, 16);
}

async function compileIsland(
  input: CompileDevAssetInput,
  jsxImportSource: string,
): Promise<EsbuildBundleResult> {
  const generated = buildIslandVirtualEntry({
    componentFile: input.entry,
    componentImportPath: input.entry,
  });
  // The on-disk name of the virtual entry MUST be deterministic
  // for a given (entry, id) pair: esbuild embeds the source path
  // in the bundle's source map, so a random tmp name would change
  // the bundle bytes across calls and break the M6 content-hash
  // filename. The file lives in a system tmp dir (see
  // VIRTUAL_ENTRY_DIR), never in the user's project dir.
  const entryHash = encodeHex(
    new TextEncoder().encode(`${input.entry}\0${input.id}`),
  ).slice(0, 16);
  const dir = await ensureVirtualEntryDir();
  const tmpFile = `${dir}/sprout-island-${entryHash}.ts`;
  // The virtual entry lives outside the project dir (see
  // VIRTUAL_ENTRY_DIR), so the deno-resolver cannot walk up
  // from the entry path to find a workspace `deno.json(c)`. Pass
  // the nearest reachable config explicitly. The lookup walks up
  // from the original entry's parent dir, matching the behavior
  // `deno run` would have for the same source file.
  const entryParent = input.entry.includes("/")
    ? input.entry.slice(0, input.entry.lastIndexOf("/"))
    : ".";
  const denoConfigPath = await findNearestDenoConfig(entryParent);
  await Deno.writeTextFile(tmpFile, generated.content);
  const bundle = await esbuildBundle({
    entryPoints: [tmpFile],
    jsxImportSource,
    sourceMap: "linked",
    denoConfigPath: denoConfigPath ?? undefined,
  });
  // The esbuild metafile's `inputs` only contains the virtual entry
  // (the Deno plugin externalizes the user component). We supplement
  // the metafile with a small regex-based walker that stats the entry
  // file and its transitive relative imports. The walker is
  // best-effort; missed transitive imports only cause a stale cache
  // (corrected on the entry file's next mtime change). This replaces
  // the previous 400-line JS parser.
  const userInputs = await walkUserInputs(input.entry);
  return {
    code: bundle.code,
    map: bundle.map,
    inputs: [...bundle.inputs, ...userInputs],
  };
}
async function compileStyle(
  input: CompileDevAssetInput,
): Promise<EsbuildBundleResult> {
  // CSS is served as-is for M4. The Deno loader does not accept
  // CSS entry points, and the M4 spec defers Sass / PostCSS /
  // CSS-modules to a later milestone. Future work can swap this
  // for a real esbuild-driven CSS pipeline (using esbuilds
  // `loader: { ".css": "css" }` directly, without the Deno
  // plugin in the way).
  const code = await Deno.readFile(input.entry);
  let mtime = 0;
  try {
    const stat = await Deno.stat(input.entry);
    mtime = stat.mtime?.getTime() ?? 0;
  } catch (_cause) {
    mtime = 0;
  }
  return {
    code,
    map: null,
    inputs: [{ path: input.entry, mtime }],
  };
}

/**
 * Extract all relative import specifiers from `content`.
 *
 * Matches: `import "..."`, `import x from "..."`, `import { a } from "..."`,
 * `import * as x from "..."`, `import("...")` (dynamic), and
 * `export ... from "..."` (re-export). Both single and double quotes
 * are handled.
 *
 * This is intentionally NOT a full JavaScript parser. It will miss
 * imports hidden inside template literals, regex literals, or
 * comments. The worst-case failure mode is a stale dev cache entry
 * (corrected on the entry file's next mtime bump), NOT incorrect
 * behavior. Do NOT "fix" this back into a state machine without a
 * compelling benchmark showing the regex is a bottleneck.
 */
function extractRelativeImports(content: string): string[] {
  const out: string[] = [];
  // Captures: (quote)(relative-path)(quote)
  // - import ... from "..."  → from + quote + path
  // - import "..."           → import + quote + path
  // - import("...")          → import( + quote + path
  // - export ... from "..."  → from + quote + path
  const re = /(?:import\s+(?:[\w*${},\s]+\s+from\s+)?|import\(\s*|from\s+)(["'])(\.\.?\/[^"']+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    out.push(m[2] as string);
  }
  return out;
}

/**
 * Walk `entryFile` and its transitive relative imports, returning
 * an `{ path, mtime }` list for every visited file.
 *
 * The esbuild metafile does not include the user's island file (the
 * Deno plugin externalizes it), so we supplement with this walker.
 * Files are read once and stat'd once; a `Set` tracks visited paths
 * to avoid cycles. The entry file itself is always included.
 */
async function walkUserInputs(entryFile: string): Promise<EsbuildBundleInput[]> {
  const visited = new Set<string>();
  const result: EsbuildBundleInput[] = [];

  async function walk(filePath: string): Promise<void> {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    let mtime = 0;
    try {
      const stat = await Deno.stat(filePath);
      mtime = stat.mtime?.getTime() ?? 0;
    } catch (_cause) {
      // File unreadable or deleted; record mtime=0 and skip reading.
      result.push({ path: filePath, mtime: 0 });
      return;
    }
    result.push({ path: filePath, mtime });

    let content: string;
    try {
      content = await Deno.readTextFile(filePath);
    } catch (_cause) {
      // Cannot read; nothing more to walk from this file.
      return;
    }

    const dir = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : ".";
    for (const spec of extractRelativeImports(content)) {
      const resolved = resolveRelativeImport(dir, spec);
      if (resolved !== null) {
        await walk(resolved);
      }
    }
  }

  await walk(entryFile);
  return result;
}

function contentTypeFor(kind: AssetKind, isMap: boolean): string {
  if (isMap) {
    return "application/json; charset=utf-8";
  }
  switch (kind) {
    case "runtime":
    case "island":
      return "text/javascript; charset=utf-8";
    case "style":
      return "text/css; charset=utf-8";
  }
}

async function buildForKind(
  input: CompileDevAssetInput,
): Promise<EsbuildBundleResult> {
  switch (input.kind) {
    case "runtime": {
      const denoConfigPath = await findNearestDenoConfig(input.config.root);
      return await esbuildBundle({
        entryPoints: [input.entry],
        jsxImportSource: input.jsxImportSource,
        sourceMap: "linked",
        denoConfigPath: denoConfigPath ?? undefined,
      });
    }
    case "island":
      return await compileIsland(input, input.jsxImportSource);
    case "style":
      return await compileStyle(input);
  }
}

/**
 * Compile a dev asset.
 *
 * The cache is keyed on (entry, kind, id, mode, envHash). On a
 * hit the cache re-stats the recorded input set before serving
 * the result, so an mtime change forces a rebuild. Concurrent
 * cold calls coalesce via the single-flight promise slot.
 */
export async function compileDevAsset(
  input: CompileDevAssetInput,
): Promise<CompileDevAssetResult> {
  await cleanupStaleVirtualEntries();
  const envHash = await computePublicEnvHash(input.mode);
  const c = getOrCreateCache(input.config.root);
  const entry = await c.getOrBuild(
    {
      entry: input.entry,
      kind: input.kind,
      id: input.id,
      mode: input.mode,
      envHash,
      jsxImportSource: input.jsxImportSource,
    },
    () => buildForKind(input),
  );
  const hash = hashInputs(entry.result.inputs);
  return {
    kind: input.kind,
    id: input.id,
    publicPath: input.publicPath,
    js: entry.result.code,
    map: entry.result.map,
    contentType: contentTypeFor(input.kind, false),
    hash,
    cacheKey: entry.key,
  };
}

/**
 * Return the source map for a dev asset, or null when the asset
 * did not produce a map. Used by the dev server's
 * /@sprout/<asset>.js.map routes.
 */
export async function compileDevSourceMap(
  input: CompileDevAssetInput,
): Promise<Uint8Array | null> {
  const envHash = await computePublicEnvHash(input.mode);
  const c = getOrCreateCache(input.config.root);
  const entry = await c.getOrBuild(
    {
      entry: input.entry,
      kind: input.kind,
      id: input.id,
      mode: input.mode,
      envHash,
      jsxImportSource: input.jsxImportSource,
    },
    () => buildForKind(input),
  );
  return entry.result.map;
}
