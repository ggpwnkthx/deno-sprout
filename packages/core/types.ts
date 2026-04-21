// types.ts - Core type definitions
import type { Context } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";

// ── Manifest types (Phase 1 Task 9) ──────────────────────────────────────────

/**
 * A single route entry inside a `RoutesManifest`.
 */
export interface RouteManifestEntry {
  /**
   * URL pattern matched by this route, e.g. `"/about"` or `"/blog/[slug]"`.
   */
  pattern: string;
  /**
   * Absolute file path to the route module that handles this pattern.
   */
  filePath: string;
  /**
   * `true` when the route module exports only API handlers (no page component).
   */
  isApi: boolean;
  /**
   * `true` when this route opts out of layout inheritance.
   */
  skipInheritedLayouts: boolean;
  /**
   * Optional override for the matched file path, used by layout overrides.
   */
  routeOverride?: string;
  /**
   * Ordered list of layout file paths wrapping this route.
   */
  layoutChain: string[];
  /**
   * Ordered list of middleware file paths applied to this route.
   */
  middlewareChain: string[];
}

/**
 * The full route manifest produced by the build step.
 * Used by `fsRoutesFromManifest` to reconstruct routing in deploy mode.
 */
export interface RoutesManifest {
  /** All route entries. */
  routes: RouteManifestEntry[];
  /** ISO timestamp of when the manifest was built. */
  builtAt: string;
  /** Version string of the sprout build that produced this manifest. */
  version: string;
}

// ── Route/layout config (original stub) ──────────────────────────────────────

/**
 * Per-route configuration options.
 */
export interface RouteConfig {
  /**
   * Override the file path used to resolve this route.
   */
  routeOverride?: string;
  /**
   * Opt out of layout inheritance for this route.
   */
  skipInheritedLayouts?: boolean;
}

/**
 * Per-layout configuration options.
 */
export interface LayoutConfig {
  /**
   * Opt out of layout inheritance for this layout's children.
   */
  skipInheritedLayouts?: boolean;
}

// ── Page/component types (Phase 4 Task 2 cleanup) ────────────────────────────

/**
 * Props passed to a page component by the framework.
 *
 * @template TData - Shape of the data loaded by the page's loader.
 */
export interface PageProps<TData = unknown> {
  /**
   * Data returned by the page's loader. Undefined when the page has no loader.
   */
  data: TData;
  /** Dynamic segments extracted from the URL pattern, e.g. `{ slug: "my-post" }`. */
  params: Record<string, string>;
  /** The current request URL. */
  url: URL;
}

/**
 * A page component receives `PageProps` and renders the page content.
 *
 * @template TData - Shape of the data returned by the page's loader.
 */
export type PageComponent<TData = unknown> = (
  props: PageProps<TData>,
) => Child;

/**
 * A layout component wraps a route's rendered output (or a child layout's)
 * and must call `children` to render the inner content.
 */
export type LayoutComponent = (
  props: { children: Child },
) => Child;

/**
 * A single-HTTP-method handler function. Receives the Hono context and
 * returns a `Response` (or a promise that resolves to one).
 */
export type Handler = (c: Context) => Response | Promise<Response>;

/**
 * A map of HTTP method handlers. Each key is an uppercase method name.
 * A handler may be omitted; missing methods return 405 Method Not Allowed.
 */
export type Handlers = Partial<
  Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD", Handler>
>;

/**
 * A data loader runs before the page component and provides data for it.
 * Runs on every request (server-side); used for server-side data fetching.
 *
 * @template TData - Shape of the data returned to the page.
 */
export type DataLoader<TData = unknown> = (
  c: Context,
) => TData | Promise<TData>;

// ── Error/404 page props (Phase 4 Task 1) ────────────────────────────────────

/**
 * Props passed to a custom error page component.
 */
export interface ErrorPageProps {
  /** The error that was thrown. */
  error: Error;
  /** The request URL that triggered the error. */
  url: URL;
}

/**
 * Props passed to a custom 404 page component.
 */
export interface NotFoundPageProps {
  /** The request URL that was not found. */
  url: URL;
}
