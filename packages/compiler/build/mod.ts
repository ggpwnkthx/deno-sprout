// Build subpackage for @sprout/compiler.
//
// M4 ships the dev asset compile surface (`compileDevAsset`,
// `compileDevSourceMap`). M6 adds the production build surface:
// `buildProduction`, `formatBuildSummary`. M7 lands the real
// `loadFrozenIndex` and `readFrozenAsset` (no more stubs). The
// asset-writer / outDir-safety / gzip helpers stay
// package-internal.
export { _resetDevCacheForTests, compileDevAsset, compileDevSourceMap } from "./dev_assets.ts";
export type { AssetKind, CompileDevAssetInput, CompileDevAssetResult } from "./dev_assets.ts";
export { buildProduction, formatBuildSummary } from "./production.ts";
export type { BuildOptions, BuildSummary } from "./production.ts";
export { loadFrozenIndex } from "./frozen_index.ts";
export type { FrozenIndex } from "../manifest/types.ts";
export { readFrozenAsset } from "./frozen_reader.ts";
export type { ReadFrozenAssetResult } from "./frozen_reader.ts";
