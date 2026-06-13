// Compile a dev asset (runtime, island, or stylesheet) on demand.
//
// compileDevAsset is the entry point used by the dev server. It
// looks up (or builds) the asset through a process-local
// SingleFlightCache, applies the kind-specific compile strategy,
// and returns the bytes plus content type. The cache invalidates
// on input mtime changes (see cache.ts).
import type { ResolvedConfig } from "@sprout/config";
import { encodeHex } from "@std/encoding/hex";
import type { EsbuildBundleInput, EsbuildBundleResult } from "./esbuild.ts";
import { esbuildBundle, VIRTUAL_ENTRY_DIR } from "./esbuild.ts";
import { hashInputs, SingleFlightCache } from "./cache.ts";
import { buildIslandVirtualEntry } from "./virtual_modules.ts";

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
function findNearestDenoConfig(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    for (const name of ["deno.json", "deno.jsonc"]) {
      const candidate = `${dir}/${name}`;
      try {
        const stat = Deno.statSync(candidate);
        if (stat.isFile) return candidate;
      } catch (_cause) {
        // not present; try the next name / parent dir
      }
    }
    if (!dir.includes("/")) return null;
    const parent = dir.slice(0, dir.lastIndexOf("/"));
    if (parent.length === 0 || parent === dir) return null;
    dir = parent;
  }
}

let cache: SingleFlightCache | null = null;
function getCache(): SingleFlightCache {
  if (cache === null) {
    cache = new SingleFlightCache();
  }
  return cache;
}

/** Reset the module-level cache (tests only). */
export function _resetDevCacheForTests(): void {
  if (cache !== null) {
    cache.clear();
  }
  cache = null;
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
  //
  // Lifetime policy (deliberate, do not change without a cache
  // review): the tmp file is INTENTIONALLY kept on disk across
  // calls. A prior implementation deleted the file in a `finally`
  // block, which produced flaky tests: the dev cache's input-set
  // stat check re-stats the virtual entry on every cache hit, and
  // a missing file (because the previous test's `finally` ran or
  // a crash interrupted cleanup) would force a spurious rebuild.
  // The bundle's esbuild metafile lists the tmp file as an input,
  // so `esbuildBundle` filters it out (see
  // `isInsideVirtualEntryDir` in `esbuild.ts`). With the filter in
  // place, the cache's input set is just the user's source files
  // and the tmp file's lifetime is irrelevant to cache stability.
  // The trade-off is a few hundred bytes of stale tmp files per
  // island per unique `(entry, id)` pair; that is documented and
  // accepted. A future startup sweep can clean the dir.
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
  const denoConfigPath = findNearestDenoConfig(entryParent);
  await Deno.writeTextFile(tmpFile, generated.content);
  const bundle = await esbuildBundle({
    entryPoints: [tmpFile],
    jsxImportSource,
    sourceMap: "linked",
    denoConfigPath: denoConfigPath ?? undefined,
  });
  // The Deno loader plugin marks the user's component import as
  // `external: true` (the runtime resolves it at mount time), so
  // the esbuild metafile's `inputs` only contains the virtual
  // entry itself. That is exactly what the filter in
  // `esbuildBundle` drops, leaving the cache with an empty input
  // set. An empty input set means a cache hit on every call,
  // which breaks invalidation for edits to the entry file or to
  // any of its transitive imports. Walk the user's import graph
  // here and append the results so the cache sees the files the
  // user can actually edit.
  const userInputs = await walkUserInputs(input.entry);
  return { ...bundle, inputs: [...bundle.inputs, ...userInputs] };
}

/**
 * Walk the import graph rooted at `entry` and return every
 * on-disk file the user can edit, each with its current mtime.
 *
 * The walker is intentionally narrow: it follows only relative
 * `from "..."` / `from '...'` specifiers (`./x`, `../x/y`), not
 * bare specifiers (`@sprout/runtime`, `npm:...`, JSR `jsr:...`).
 * Bare specifiers resolve to framework code that the user does
 * not own; tracking them in the dev cache's input set would
 * produce invalidations on framework upgrades that have nothing
 * to do with the user's project. Resolved paths are normalized
 * and probed for `.ts` / `.tsx` / `/index.ts` / `/index.tsx`
 * extensions so the walker does not have to know the file's
 * exact extension.
 *
 * This is a best-effort graph walk, not a full TypeScript
 * resolver. It will not follow dynamic imports, `import()`
 * expressions, `require()` calls, or CSS-module-style side-effect
 * imports. That is acceptable: the dev cache invalidates on the
 * common case (static `import` / `export from`), and the M4
 * spec limits user island files to a static-import shape.
 */
async function walkUserInputs(
  entry: string,
): Promise<EsbuildBundleInput[]> {
  const seen = new Set<string>();
  const out: EsbuildBundleInput[] = [];
  const stack: string[] = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    let mtime = 0;
    try {
      const stat = Deno.statSync(file);
      mtime = stat.mtime?.getTime() ?? 0;
    } catch (_cause) {
      // File went away between reads; treat as unknown mtime.
      mtime = 0;
    }
    out.push({ path: file, mtime });
    let content: string;
    try {
      content = await Deno.readTextFile(file);
    } catch (_cause) {
      continue;
    }
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ".";
    const importRegex = /\bfrom\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1] as string;
      if (!specifier.startsWith(".")) continue; // skip bare / absolute specifiers
      const resolved = resolveRelativeImport(specifier, dir);
      if (resolved !== null && !seen.has(resolved)) {
        stack.push(resolved);
      }
    }
  }
  return out;
}

/**
 * Resolve a relative import specifier (`./x`, `../x/y`) against
 * the importing file's directory. Tries the path as-is, with
 * `.ts` / `.tsx`, and as a directory containing `index.ts` /
 * `index.tsx`. Returns the first file that exists on disk, or
 * `null` when nothing matches.
 */
function resolveRelativeImport(
  specifier: string,
  dir: string,
): string | null {
  const parts = specifier.split("/");
  const baseParts = dir.split("/");
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (baseParts.length > 1) baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }
  const basePath = baseParts.join("/") || "/";
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
  ];
  for (const candidate of candidates) {
    try {
      const stat = Deno.statSync(candidate);
      if (stat.isFile) return candidate;
    } catch (_cause) {
      // try the next candidate
    }
  }
  return null;
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
    const stat = Deno.statSync(input.entry);
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
    case "runtime":
      return await esbuildBundle({
        entryPoints: [input.entry],
        jsxImportSource: input.jsxImportSource,
        sourceMap: "linked",
      });
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
  const envHash = await computePublicEnvHash(input.mode);
  const c = getCache();
  const entry = await c.getOrBuild(
    {
      entry: input.entry,
      kind: input.kind,
      id: input.id,
      mode: input.mode,
      envHash,
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
  const c = getCache();
  const entry = await c.getOrBuild(
    {
      entry: input.entry,
      kind: input.kind,
      id: input.id,
      mode: input.mode,
      envHash,
    },
    () => buildForKind(input),
  );
  return entry.result.map;
}
