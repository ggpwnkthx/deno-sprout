// Public surface of `@sprout/core`.
//
// M3 ships the server-rendering MVP: `createApp`, `serve`, the
// `RequestContext` type, the typed `CoreError`, and the re-exports
// of the small set of framework-agnostic helpers that route
// authors reach for (`defineConfig`, the public `ConfigInput` /
// `ResolvedConfig` / `Mode` types).
//
// The HTML shell, the route dispatcher, and the public-files
// middleware live under `server/`; users do not import from there
// directly. The framework asset routes (`/@sprout/runtime.js`,
// `/@sprout/app.css`, `/@sprout/island/<id>.js`) are NOT yet
// registered; they will land in the M4 development asset pipeline.
export { createApp, serve } from "./server/app.ts";
export type {
  App,
  AppAdvanced,
  CreateAppOptions,
  PageProps,
  RequestContext,
  RouteHandler,
  RouteModule,
  RoutePageComponent,
  ServeOptions,
} from "./server/types.ts";
export { getHono } from "./server/app.ts";
export type { CoreErrorCode } from "./server/errors.ts";
export { CoreError } from "./server/errors.ts";
export { defineConfig } from "@sprout/config";
export type {
  BuildConfig,
  ConfigInput,
  IslandDiscoveryConfig,
  Mode,
  ResolvedConfig,
  RouteDiscoveryConfig,
  StyleConfig,
} from "@sprout/config";
export { FrameworkError } from "@sprout/utils";
