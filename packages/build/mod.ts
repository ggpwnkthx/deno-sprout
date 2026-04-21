// @ggpwnkthx/sprout-build
// Production build and bundling
/**
 * @ggpwnkthx/sprout-build – Production build and bundling for Sprout.
 *
 * Provides the end-to-end production build pipeline:
 * - {@link buildIslands} – discover, transpile, and bundle all islands.
 * - {@link contentHash} – compute content hashes for cache-busting URLs.
 * - {@link buildManifest} / {@link readManifest} – write and read the island
 *   bundle manifest.
 * - {@link generateRoutesManifest} / {@link loadRoutesManifest} – write and
 *   read the routes manifest for Deno Deploy.
 *
 * ## Example
 *
 * ```ts
 * import { buildIslands } from "@ggpwnkthx/sprout-build";
 *
 * const result = await buildIslands({ verbose: true });
 * console.log(result.manifest);
 * ```
 *
 * @module
 */

export { buildIslands } from "./bundler.ts";
export {
  buildManifest,
  contentHash,
  readManifest,
  writeManifest,
} from "./manifest.ts";
/**
 * Alias for {@link buildManifest} provided for symmetry with
 * {@link https://jsr.io/@ggpwnkthx/sprout-core `@ggpwnkthx/sprout-core`}'s
 * `generateAssetManifest` naming convention at the consumer side.
 * @see {@link buildManifest}
 */
export { buildManifest as generateAssetManifest } from "./manifest.ts";
export {
  generateRoutesManifest,
  loadRoutesManifest,
} from "./lib/routes-manifest.ts";
export type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";
export type { DiscoveredIsland } from "./lib/assets.ts";
export type { BuildOptions, BuildResult } from "./bundler.ts";
export type { IslandManifest } from "./manifest.ts";
