/**
 * {@link @ggpwnkthx/sprout-static} — Static file serving for islands and assets.
 *
 * ## Exports
 *
 * - {@link staticFiles} — Serve arbitrary static files from a filesystem directory.
 * - {@link sproutAssets} — Serve built Sprout assets (`hydrate.js`, island bundles)
 *   under `/_sprout/*` with appropriate `Cache-Control` headers.
 * - {@link deployIslandAssets} — Deno Deploy redirect middleware for pre-uploaded
 *   CDN island bundles.
 *
 * @module
 */
export { staticFiles } from "./server.ts";
export type { StaticFilesOptions } from "./server.ts";
export { sproutAssets } from "./server.ts";
export type { SproutAssetsOptions } from "./server.ts";
export { deployIslandAssets } from "./deploy-assets.ts";
export type { DeployIslandAssetsOptions } from "./deploy-assets.ts";
