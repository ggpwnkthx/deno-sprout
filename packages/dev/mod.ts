/**
 * @ggpwnkthx/sprout-dev
 *
 * Development server with hot module replacement (HMR) support for Sprout
 * applications. This package is intended for use during development only —
 * it is not designed for production deployment.
 *
 * ## Features
 *
 * - **HMR WebSocket server** — broadcasts file change events to connected
 *   browsers so they can reload without a full page refresh.
 * - **Island bundler middleware** — on-the-fly transpilation of island
 *   components and runtime scripts at dev-time URLs (`/_sprout/islands/*`).
 * - **CSS hot-update** — style changes are applied without a full reload,
 *   preserving island state where possible.
 * - **File watcher** — monitors `routes/`, `islands/`, and `static/` and
 *   classifies change events into `{ type: "reload" | "css-update" | "island-update" }`.
 *
 * ## Typical usage
 *
 * ```ts
 * import { createDevServer } from "@ggpwnkthx/sprout-dev";
 *
 * const app = await createDevServer({ root: "./my-project" });
 * // Hand the app to Deno.serve or pass it to your HTTP server.
 * ```
 *
 * @module
 */

// Re-export types and functions from submodules for a stable public API.
export { createDevServer } from "./server.ts";
export { watchFiles } from "./hmr.ts";
export type { HmrEvent, HmrEventType, HmrWsHandler } from "./hmr.ts";
export type { BundlerError, DevBundlerOptions } from "./lib/bundler.ts";
