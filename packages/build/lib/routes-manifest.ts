// lib/routes-manifest.ts - Routes manifest generation and loading
/**
 * @ggpwnkthx/sprout-build – Routes manifest generation and loading.
 *
 * ## What it is
 *
 * The routes manifest records every file-based route discovered in the
 * project at build time, along with a build timestamp and version string.
 * It is written to `{outdir}/routes-manifest.json` and read back at runtime
 * by `@ggpwnkthx/sprout-core` to register Deno Deploy KV routes without
 * needing to re-scan the filesystem.
 *
 * This separation means the **build** does the expensive filesystem walk once,
 * and the **runtime** only reads a small JSON file — critical for cold-start
 * performance on Deno Deploy.
 *
 * @module
 */
import type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";

/**
 * Build the routes manifest for the current build.
 *
 * This is called by the build process once the full list of
 * {@link RouteManifestEntry} has been gathered (typically from the file-based
 * router in `@ggpwnkthx/sprout-router`). The returned object is serialised to
 * `{outdir}/routes-manifest.json` by the caller.
 *
 * @param routes – flat array of all discovered route entries.
 * @param builtAt – ISO-8601 timestamp recording when the build was run.
 * @param version – semantic version string of the `@ggpwnkthx/sprout-build`
 *   package at build time; stored for cache-busting and diagnostics.
 * @returns A {@link RoutesManifest} ready to be written to disk.
 *
 * @example
 * ```ts
 * const manifest = generateRoutesManifest(
 *   [{ file: "/routes/index.tsx", pattern: "/", methods: ["GET"] }],
 *   new Date().toISOString(),
 *   "0.1.0",
 * );
 * await Deno.writeTextFile("_dist/routes-manifest.json", JSON.stringify(manifest));
 * ```
 */
export function generateRoutesManifest(
  routes: RouteManifestEntry[],
  builtAt: string,
  version: string,
): RoutesManifest {
  return {
    routes,
    builtAt,
    version,
  };
}

/**
 * Load the routes manifest at runtime using a `file://` import with
 * {@link https://docs.deno.com/runtime/manual/runtime/importing_data_urls
 * import assertions}.
 *
 * Used by `@ggpwnkthx/sprout-core` on Deno Deploy to load the manifest written
 * at build time without needing a second filesystem walk.
 *
 * @param manifestPath – absolute path to `routes-manifest.json`.
 * @returns The parsed {@link RoutesManifest} object.
 * @throws If the file cannot be read or parsed as JSON.
 *
 * @example
 * ```ts
 * const manifest = await loadRoutesManifest("/app/_dist/routes-manifest.json");
 * console.log(manifest.routes);
 * ```
 */
export async function loadRoutesManifest(
  manifestPath: string,
): Promise<RoutesManifest> {
  const url = `file://${manifestPath}`;
  const manifest = await import(url, { with: { type: "json" } });
  return manifest.default as RoutesManifest;
}
