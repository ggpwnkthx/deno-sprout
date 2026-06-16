// Public surface of @sprout/compiler.
//
// M0-M2 shipped discovery, manifest construction, and inspect-style
// formatters. M4 added the dev asset pipeline (`compileDevAsset`).
// M6 added the production build surface: `buildProduction` (which
// writes the content-hashed `outDir`, the `sprout.manifest.json`,
// and optional `.gz` companions) and `formatBuildSummary` (the
// CLI's human-readable summary). M7 lands the real frozen-manifest
// readers: `loadFrozenIndex` (the O(1) public-path index built once
// at startup, no bytes loaded) and `readFrozenAsset` (lazy raw +
// gzip byte reads, with a typed `FROZEN_MANIFEST_MISSING` on a
// missing manifest and `FROZEN_MANIFEST_UNSUPPORTED` on a malformed
// manifest).
export { discoverProject } from "./discover/project.ts";
export { discoverIslands } from "./discover/islands.ts";
export { discoverRoutes } from "./discover/routes.ts";
export { validateManifest } from "./manifest/validate.ts";
export { formatDiscoveredProject, formatManifest } from "./inspect.ts";
export {
  globToRegExp,
  islandFileToPublicPath,
  isReservedAssetPath,
  matchesDiscoveryGlobs,
  RESERVED_ASSET_PREFIX,
  routeFileToPattern,
} from "./manifest/paths.ts";
export type {
  BuildOutput,
  DiscoveredIsland,
  DiscoveredProject,
  DiscoveredRoute,
  FrozenAsset,
  FrozenAssetKind,
  FrozenIndex,
  FrozenManifest,
  IslandEntry,
  Manifest,
  ManifestError,
  RouteEntry,
  RoutePattern,
  StyleEntry,
} from "./manifest/types.ts";
export { CompilerError } from "./errors.ts";
export type { CompilerErrorCode } from "./errors.ts";
export {
  buildProduction,
  compileDevAsset,
  compileDevSourceMap,
  formatBuildSummary,
  loadFrozenIndex,
  readFrozenAsset,
  readFrozenAssetFromOutDir,
} from "./build/mod.ts";
export type {
  AssetKind,
  BuildOptions,
  BuildSummary,
  CompileDevAssetInput,
  CompileDevAssetResult,
  ReadFrozenAssetResult,
} from "./build/mod.ts";
export { resolveIslandEntryFile, resolveRuntimeEntryFile } from "./source_paths.ts";
