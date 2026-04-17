// types.ts - Core type definitions

// deno-lint-ignore no-explicit-any
export type PageComponent = (props: any) => any;
// deno-lint-ignore no-explicit-any
export type LayoutComponent = (props: any) => any;
// deno-lint-ignore no-explicit-any
export type Handler = (ctx: any) => any;
export type Handlers = Record<string, Handler>;

export interface RouteConfig {
  routeOverride?: string;
  skipInheritedLayouts?: boolean;
}

/**
 * A single route entry as recorded in the build-time manifest.
 * Written by `sprout-build`, read by `sprout-router` at runtime on Deno Deploy.
 */
export interface RouteManifestEntry {
  /** URL pattern suitable for Hono, e.g. "/blog/:slug". */
  pattern: string;
  /** Absolute path to the source file at build time. NOT used at Deploy runtime. */
  filePath: string;
  /** True if the route has no default export (pure API route). */
  isApi: boolean;
  /** True if this route ignores all ancestor _layout.tsx files. */
  skipInheritedLayouts: boolean;
  /** Overrides the computed URL pattern for this route. */
  routeOverride?: string;
  /**
   * Absolute paths to _layout.tsx files, outermost-first.
   * Populated at build time by `resolveLayoutChain`.
   * Read directly at runtime on Deploy — no filesystem access needed.
   */
  layoutChain: string[];
  /**
   * Absolute paths to _middleware.ts files, outermost-first.
   */
  middlewareChain: string[];
}

/**
 * The full build-time route manifest, written to `_dist/routes.json`.
 */
export interface RoutesManifest {
  /** Sorted: static → dynamic → catch-all. */
  routes: RouteManifestEntry[];
  /** ISO timestamp of the build. */
  builtAt: string;
  /** Package version at build time. */
  version: string;
}

export interface LayoutConfig {
  skipInheritedLayouts?: boolean;
}
