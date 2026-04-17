// @ggpwnkthx/sprout-build
// Production build and bundling

export { buildIslands } from "./bundler.ts";
export { generateAssetManifest } from "./manifest.ts";
export {
  generateRoutesManifest,
  loadRoutesManifest,
} from "./lib/routes-manifest.ts";
export type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";
export type { AssetManifest, BuildOptions, BuildResult } from "./lib/assets.ts";
