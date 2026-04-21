// manifest.ts - Asset manifest generation
/**
 * @ggpwnkthx/sprout-build – Asset manifest generation and I/O.
 *
 * ## What the manifest is
 *
 * The build manifest (`manifest.json`) is the runtime contract between the
 * build step ({@link buildIslands}) and the running application
 * (`@ggpwnkthx/sprout-core`). It records, for each island:
 * - The **content-hashed** URL at which the island bundle is served.
 *   Hashing enables aggressive browser caching: when the island source changes,
 *   the hash changes, so the new bundle gets a new URL and the browser loads it
 *   unconditionally — no cache-busting query strings needed.
 * - The URL of the shared `hydrate.js` runtime (kept unhashed so it can be
 *   cached long-term with `Cache-Control: immutable` alongside island bundles).
 *
 * ## Manifest schema
 *
 * ```json
 * {
 *   "islands": {
 *     "Counter": "/_sprout/islands/Counter.ab1c2d3e.js",
 *     "Timer":   "/_sprout/islands/Timer.f5e6d7c8b.js"
 *   },
 *   "hydrate": "/_sprout/hydrate.js"
 * }
 * ```
 *
 * ## How it is consumed
 *
 * `manifest.json` is read by `@ggpwnkthx/sprout-core` at startup (in production;
 * in development it falls back to per-island filesystem discovery). The core
 * uses it to register island routes on Deno Deploy and to resolve which island
 * bundle URL to inject into the page shell at render time.
 *
 * @module
 */
import { encodeHex } from "@std/encoding/hex";
import { ensureDir } from "@std/fs/ensure-dir";
import { join } from "@std/path";

/**
 * The machine-readable build manifest produced by {@link buildIslands}.
 *
 * It is serialised as `manifest.json` and read at runtime by
 * `@ggpwnkthx/sprout-core` when running in production.
 */
export interface IslandManifest {
  /**
   * Map from island name (i.e. the island file's base name, without extension)
   * to the **content-hashed** URL at which the island bundle is served.
   *
   * The URL is absolute and starts with `/_sprout/islands/`. Example:
   * ```json
   * { "Counter": "/_sprout/islands/Counter.ab1c2d3e.js" }
   * ```
   *
   * The hash (first 8 hex chars of SHA-256 of the bundle bytes) changes whenever
   * the island's source changes, giving browsers a new URL and thus bypassing
   * any stale cached copy.
   */
  islands: Record<string, string>;
  /**
   * The URL of the island hydration runtime bundle.
   *
   * This value is always `"/_sprout/hydrate.js"` and is **not** content-hashed.
   * Because the runtime is small and stable, keeping it at a fixed URL allows
   * the server to set a long `max-age` / `immutable` cache policy without
   * preventing island bundle updates (which have their own hashed URLs).
   */
  hydrate: string;
}

/**
 * Compute a content hash from raw bundle bytes.
 *
 * The hash is the first **8 hexadecimal characters** of the SHA-256 digest of
 * `bytes`. 8 chars gives ~16-bit entropy per island, which is sufficient for
 * cache-busting use cases while keeping URLs compact.
 *
 * @param bytes – raw bytes of the transpiled island bundle (or any file).
 * @returns An 8-character lower-case hex string, e.g. `"ab1c2d3e"`.
 *
 * @example
 * ```ts
 * const hash = await contentHash(new TextEncoder().encode("console.log('hi')"));
 * // → e.g. "3e2d1cba"
 * ```
 */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer as ArrayBuffer,
  );
  const hashArray = new Uint8Array(hashBuffer);
  const hex = encodeHex(hashArray);
  return hex.slice(0, 8);
}

/**
 * Build an {@link IslandManifest} from a map of island names to their transpiled
 * JS source text.
 *
 * This function is called by {@link buildIslands} after all island bundles have
 * been written. For each island entry it:
 * 1. Encodes the source text as UTF-8 bytes.
 * 2. Calls {@link contentHash} to compute the 8-char SHA-256 prefix.
 * 3. Assigns the full hashed URL `/_sprout/islands/{Name}.{hash}.js`.
 *
 * @param islands – map of island name → transpiled JS source text, as returned
 *   by the per-island esbuild transpilation step in {@link buildIslands}.
 * @returns A fully-populated {@link IslandManifest} with all islands mapped.
 *
 * @example
 * ```ts
 * const manifest = await buildManifest({
 *   Counter: await transpile({ source: wrapperSource, name: "Counter" }).then(r => r.code),
 * });
 * // manifest.islands.Counter === "/_sprout/islands/Counter.ab1c2d3e.js"
 * ```
 */
export async function buildManifest(
  islands: Record<string, string>, // name → compiled JS text
): Promise<IslandManifest> {
  const manifest: IslandManifest = {
    islands: {},
    hydrate: "/_sprout/hydrate.js",
  };

  for (const [name, code] of Object.entries(islands)) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(code);
    const hash = await contentHash(bytes);
    manifest.islands[name] = `/_sprout/islands/${name}.${hash}.js`;
  }

  return manifest;
}

/**
 * Serialise an {@link IslandManifest} to `{outdir}/manifest.json`.
 *
 * The file is indented with 2 spaces to remain human-readable during
 * development. It is overwritten if present (idempotent, so safe to re-run).
 *
 * @param manifest – the manifest produced by {@link buildManifest}.
 * @param outdir – output directory (same as {@link BuildOptions.outdir}).
 * @returns Resolves once the file has been written.
 */
export async function writeManifest(
  manifest: IslandManifest,
  outdir: string,
): Promise<void> {
  await ensureDir(outdir);
  const path = join(outdir, "manifest.json");
  const content = JSON.stringify(manifest, null, 2);
  await Deno.writeFile(path, new TextEncoder().encode(content));
}

/**
 * Read and parse an {@link IslandManifest} from `{distDir}/manifest.json`.
 *
 * This is the runtime counterpart of {@link writeManifest}. It is used by
 * `@ggpwnkthx/sprout-core` at startup to load the manifest produced at build
 * time and register island routes on Deno Deploy.
 *
 * @param distDir – the directory containing `manifest.json` (typically the
 *   value of `outdir` passed to the build).
 * @returns The parsed manifest, or `null` if the file does not exist (which is
 *   the expected case in development mode where the build step is bypassed).
 * @throws Any I/O error other than `NotFound` (e.g. permission errors,
 *   corrupted JSON).
 */
export async function readManifest(
  distDir: string,
): Promise<IslandManifest | null> {
  const path = join(distDir, "manifest.json");
  try {
    const content = await Deno.readFile(path);
    const text = new TextDecoder().decode(content);
    return JSON.parse(text) as IslandManifest;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return null;
    }
    throw err;
  }
}
