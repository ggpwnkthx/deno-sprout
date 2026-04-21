// @ggpwnkthx/sprout-router
// File-system routing and route matching
/**
 * Route files discovered from the routes directory.
 */
export { fsRoutes } from "./fs.ts";
/**
 * Route matching and path generation utilities.
 */
export { generatePath, matchRoute } from "./matcher.ts";
export type { RouteMatch, RoutePattern } from "./matcher.ts";
export type { LayoutConfig, RouteConfig } from "./config.ts";
// Public types used by fsRoutes consumers
export type { FsRoutesOptions, PageRouteOptions, RouteModule } from "./fs.ts";
export type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";
// Re-export chain resolution utilities
export { resolveLayoutChain, resolveMiddlewareChain } from "./groups.ts";
// Typed error hierarchy
export {
  HandlerNotCallable,
  InvalidManifest,
  InvalidRouteOverride,
  MiddlewareNotCallable,
  RouteOutsideDirectory,
  RouterError,
  RoutesDirNotFound,
} from "./lib/errors.ts";
