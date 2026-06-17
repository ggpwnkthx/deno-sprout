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
      const candidate = `${dir}/${name}`;
      try {
        const stat = await Deno.stat(candidate);
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
  const denoConfigPath = await findNearestDenoConfig(entryParent);
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
 * The walker follows relative specifiers:
 *   - import "specifier"            (side-effect)
 *   - import x from "specifier"     (default)
 *   - import { a, b } from "specifier"  (named)
 *   - import * as x from "specifier" (namespace)
 *   - import("specifier")            (dynamic with string literal;
 *                                     variable specifiers are NOT followed)
 *
 * It intentionally skips:
 *   - Bare / absolute specifiers (@sprout/runtime, npm:..., jsr:...)
 *   - Imports inside line comments (double-slash) or block comments
 *   - Dynamic imports whose specifier is not a string literal
 *
 * Bare specifiers resolve to framework code that the user does not
 * own; tracking them in the dev cache's input set would produce
 * invalidations on framework upgrades unrelated to the user's
 * project. Resolved paths are normalized and probed for .ts /
 * .tsx / /index.ts / /index.tsx extensions so the walker does
 * not have to know the file's exact extension.
 *
 * This is a best-effort graph walk, not a full TypeScript resolver.
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
      const stat = await Deno.stat(file);
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
    const specifiers = extractImportSpecifiers(content);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue; // skip bare / absolute specifiers
      const resolved = resolveRelativeImport(dir, specifier);
      if (resolved !== null && !seen.has(resolved)) {
        stack.push(resolved);
      }
    }
  }
  return out;
}

/**
 * Scan content for all import specifiers it contains.
 *
 * Detects:
 *   - import "specifier"              (side-effect)
 *   - import x from "specifier"       (default)
 *   - import { a, b } from "specifier"  (named)
 *   - import * as x from "specifier"  (namespace)
 *   - import("specifier")             (dynamic with string literal)
 *
 * Skips:
 *   - Line comments (double-slash)
 *   - Block comments
 *   - Dynamic imports whose specifier is not a string literal
 *
 * Returns the raw specifier strings (unresolved).
 */
/**
 * Parser states for the import-specifier state machine.
 * @internal
 */
enum ParseState {
  NORMAL = "NORMAL",
  LINE_COMMENT = "LINE_COMMENT",
  BLOCK_COMMENT = "BLOCK_COMMENT",
  SQUOTE = "SQUOTE",
  DQUOTE = "DQUOTE",
  TEMPLATE = "TEMPLATE",
  REGEX = "REGEX",
}

/**
 * True when content[i] is likely the opening `/` of a regex literal
 * (i.e., the character before position i would reasonably precede a regex).
 * Uses the standard JavaScript heuristic: after a token that cannot be
 * followed by a division `/`, the `/` must be a regex opening delimiter.
 */
function isRegexPreceded(content: string, i: number): boolean {
  let j = i - 1;
  // Skip whitespace
  while (j >= 0 && (content[j] === " " || content[j] === "\t")) j--;
  if (j < 0) return true; // start of content is valid

  const prev = content[j]!;
  // Tokens that cannot be followed by a division `/`, so `/` here = regex
  if ("=([,;:[!&|?{}]+-*%^~<>".includes(prev)) return true;

  // Skip backward past whitespace/newlines to find preceding token
  while (
    j >= 0 &&
    (content[j] === " " || content[j] === "\t" || content[j] === "\n" || content[j] === "\r")
  ) j--;
  if (j < 0) return true;

  // Keywords that can precede a regex
  const kw = [
    "return",
    "typeof",
    "instanceof",
    "in",
    "of",
    "void",
    "delete",
    "throw",
    "new",
    "yield",
    "await",
  ];
  for (const keyword of kw) {
    const start = j - keyword.length + 1;
    if (start >= 0 && content.slice(start, j + 1) === keyword) return true;
  }

  return false;
}

/** True when the next six characters starting at `i` form the word `import`. */
function isImportKeywordAt(content: string, i: number): boolean {
  return (
    i + 6 <= content.length &&
    content[i] === "i" &&
    content[i + 1] === "m" &&
    content[i + 2] === "p" &&
    content[i + 3] === "o" &&
    content[i + 4] === "r" &&
    content[i + 5] === "t" &&
    (i + 6 >= content.length ||
      !isIdentifierChar(content[i + 6] as string))
  );
}

/** True when `c` can appear in a TypeScript / JavaScript identifier. */
function isIdentifierChar(c: string): boolean {
  return /[a-zA-Z0-9_$]/.test(c);
}

/**
 * Scan content for all import specifiers it contains.
 *
 * Detects:
 *   - import "specifier"              (side-effect)
 *   - import x from "specifier"       (default)
 *   - import { a, b } from "specifier"  (named)
 *   - import * as x from "specifier"  (namespace)
 *   - import("specifier")             (dynamic with string literal)
 *
 * Skips:
 *   - Line comments (double-slash)
 *   - Block comments
 *   - String literals (single/double quoted)
 *   - Template literals (backtick), including `${...}` interpolations
 *   - Regex literals
 *   - Dynamic imports whose specifier is not a string literal
 *
 * Returns the raw specifier strings (unresolved).
 */
/** @internal */
export function extractImportSpecifiers(content: string): string[] {
  const out: string[] = [];
  let state: ParseState = ParseState.NORMAL;
  // Track whether we are inside a `[...]` character class in REGEX state
  let regexInCharClass = false;
  let i = 0;

  while (i < content.length) {
    switch (state) {
      case ParseState.NORMAL: {
        const c = content[i];
        if (c === "/" && content[i + 1] === "/") {
          state = ParseState.LINE_COMMENT;
          i += 2;
          continue;
        }
        if (c === "/" && content[i + 1] === "*") {
          state = ParseState.BLOCK_COMMENT;
          i += 2;
          continue;
        }
        // String / template literal openings — enter quoted states
        if (c === "'") {
          state = ParseState.SQUOTE;
          i++;
          continue;
        }
        if (c === '"') {
          state = ParseState.DQUOTE;
          i++;
          continue;
        }
        if (c === "`") {
          state = ParseState.TEMPLATE;
          i++;
          continue;
        }
        // Regex literal — enter REGEX state when preceded by a valid precursor
        if (c === "/" && isRegexPreceded(content, i)) {
          state = ParseState.REGEX;
          regexInCharClass = false;
          i++;
          continue;
        }
        // Import keyword
        if (isImportKeywordAt(content, i)) {
          const specifier = tryParseImportSpecifiers(content, i);
          if (specifier !== null) out.push(specifier);
          // Move past the import keyword
          i += 6; // "import".length
          while (
            i < content.length &&
            (content[i] === " " || content[i] === "\t" || content[i] === "\n" ||
              content[i] === "\r")
          ) i++;
          // If followed by `(`, extract the dynamic import's specifier
          if (content[i] === "(") {
            i++; // skip '('
            while (i < content.length && content[i] !== ")") {
              if (content[i] === '"' || content[i] === "'" || content[i] === "`") {
                const quote = content[i];
                i++;
                let spec = "";
                while (i < content.length && content[i] !== quote) {
                  if (content[i] === "\\") i++; // skip escaped char
                  if (i < content.length) {
                    spec += content[i];
                    i++;
                  }
                }
                if (spec) out.push(spec);
                if (i < content.length && content[i] === quote) i++;
              } else {
                i++;
              }
            }
            if (i < content.length && content[i] === ")") i++;
          }
          continue;
        }
        i++;
        continue;
      }

      case ParseState.TEMPLATE: {
        if (content[i] === "\\") {
          i += 2; // skip escaped char
        } else if (content[i] === "`") {
          i++;
          state = ParseState.NORMAL;
        } else if (content[i] === "$" && content[i + 1] === "{") {
          // Skip the entire ${...} interpolation block, tracking nested braces
          let depth = 1;
          i += 2; // skip ${
          while (i < content.length && depth > 0) {
            if (content[i] === "\\") {
              i += 2;
            } else if (content[i] === "{") {
              depth++;
              i++;
            } else if (content[i] === "}" && --depth === 0) {
              i++; // skip closing }
            } else if (content[i] === "`") {
              // Unescaped backtick inside interpolation — skip (shouldn't happen in valid JS)
              i++;
            } else {
              i++;
            }
          }
        } else if (isImportKeywordAt(content, i)) {
          // Found an import keyword inside the template
          const specifier = tryParseImportSpecifiers(content, i);
          if (specifier !== null && !specifier.includes("${")) {
            // Not a dynamic import — include it
            out.push(specifier);
          }
          // Advance past the import keyword
          i += 6;
          while (
            i < content.length &&
            (content[i] === " " || content[i] === "\t" || content[i] === "\n" ||
              content[i] === "\r")
          ) i++;
          // Skip the following string literal if present
          if (content[i] === '"' || content[i] === "'") {
            const quote = content[i];
            i++;
            while (i < content.length && content[i] !== quote) {
              if (content[i] === "\\") i++;
              if (i < content.length) i++;
            }
            if (i < content.length) i++; // skip closing quote
          }
        } else {
          i++;
        }
        continue;
      }

      case ParseState.SQUOTE:
      case ParseState.DQUOTE: {
        const quote = state === ParseState.SQUOTE ? "'" : '"';
        if (content[i] === "\\") {
          i += 2; // skip escaped char
        } else if (content[i] === quote) {
          i++;
          state = ParseState.NORMAL;
        } else {
          i++;
        }
        continue;
      }

      case ParseState.REGEX: {
        if (content[i] === "\\") {
          i += 2; // skip escaped char
        } else if (content[i] === "[") {
          regexInCharClass = true;
          i++;
        } else if (content[i] === "]") {
          regexInCharClass = false;
          i++;
        } else if (content[i] === "/" && !regexInCharClass) {
          // Only exit REGEX state if this `/` is a valid regex closing delimiter:
          // - followed by a regex flag letter (g, i, m, s, u, y, d), OR
          // - followed by a non-identifier, non-dot character (whitespace, ;, ), ], +, -, *, /, %, =, !, <, >, &, |, ^, ~, ?, :, end-of-content)
          const next = content[i + 1];
          const isFlag = next === "g" || next === "i" || next === "m" ||
            next === "s" || next === "u" || next === "y" || next === "d";
          const isNonIdentifierNonDot = next !== undefined &&
            !isIdentifierChar(next) && next !== ".";
          if (isFlag || isNonIdentifierNonDot) {
            i++;
            state = ParseState.NORMAL;
          } else {
            // Literal `/` inside regex body — keep scanning
            i++;
          }
        } else {
          i++;
        }
        continue;
      }

      case ParseState.LINE_COMMENT: {
        if (content[i] === "\n") {
          i++;
          state = ParseState.NORMAL;
        } else {
          i++;
        }
        continue;
      }

      case ParseState.BLOCK_COMMENT: {
        if (content[i] === "*" && content[i + 1] === "/") {
          i += 2;
          state = ParseState.NORMAL;
        } else {
          i++;
        }
        continue;
      }
    }
  }

  return out;
}

/**
 * Attempt to parse an import starting at the `import` keyword
 * (right after the `isImportKeywordAt` check). Returns the specifier
 * string, or `null` if the import does not have a resolvable specifier
 * form we track (e.g., `import(variable)` — the parens are handled by
 * the caller).
 *
 * Handles:
 *   import "specifier"
 *   import 'specifier'
 *   import x from "specifier"
 *   import { a, b } from "specifier"
 *   import * as x from "specifier"
 *   import "specifier";
 */
function tryParseImportSpecifiers(content: string, i: number): string | null {
  // Skip to the first non-whitespace character after "import"
  let pos = i + 6; // past "import"
  while (
    pos < content.length &&
    (content[pos] === " " || content[pos] === "\t" || content[pos] === "\n" ||
      content[pos] === "\r")
  ) pos++;

  // import "specifier" or import 'specifier'  (side-effect)
  if (content[pos] === '"' || content[pos] === "'") {
    return parseStringLiteral(content, pos);
  }

  // import(               (dynamic import — handled by caller)
  if (content[pos] === "(") {
    return null;
  }

  // import { ... } from "specifier"   or   import x from "specifier"
  // import * as x from "specifier"
  // Skip the default/NamespaceSpecifier until we hit `from`
  let hasFrom = false;
  while (pos < content.length) {
    if (content[pos] === "f" && content.slice(pos, pos + 4) === "from") {
      hasFrom = true;
      pos += 4;
      break;
    }
    pos++;
  }
  if (!hasFrom) return null;

  // Skip whitespace
  while (
    pos < content.length &&
    (content[pos] === " " || content[pos] === "\t" || content[pos] === "\n" ||
      content[pos] === "\r")
  ) pos++;

  // Now should be at a string literal
  if (content[pos] === '"' || content[pos] === "'") {
    return parseStringLiteral(content, pos);
  }

  return null;
}

/** Parse a single- or double-quoted string literal starting at `pos`. Returns the content without quotes. */
function parseStringLiteral(content: string, pos: number): string | null {
  const quote = content[pos];
  pos++;
  let out = "";
  while (pos < content.length && content[pos] !== quote) {
    if (content[pos] === "\\") {
      pos++;
      if (pos < content.length) {
        out += content[pos];
        pos++;
      }
    } else {
      out += content[pos];
      pos++;
    }
  }
  // pos is now at closing quote (or end of string)
  return out;
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
