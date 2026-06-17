// Public type surface for `@sprout/core`.
//
// All exported types are `readonly` so users can rely on the framework
// not mutating their inputs. Deno's Web `Request` / `Response` /
// `URL` types are the only platform assumptions, so the surface is
// portable to any Web-runtime that ships a fetch-compatible server.
//
// The `App` type is intentionally narrow: it exposes only `fetch`
// and `getAssetCacheStats`. Advanced consumers who need the
// underlying Hono instance can call `getHono(app)` (re-exported from
// this module) to access it. The Hono instance is never part of the
// public `App` type so `@sprout/core` consumers who do not import
// Hono directly are not forced to add it to their import map.
import type { Hono } from "@hono/hono";
import type { JSXNode } from "@hono/hono/jsx";
import type { HtmlEscapedString } from "jsr:@hono/hono@4.12.24/utils/html";

/**
 * The framework HTTP app.
 *
 * `fetch` is the canonical request entry point and matches the
 * `Deno.serve` handler signature: pass it directly to
 * `Deno.serve({ ... }, app.fetch)` or to any fetch-style server.
 *
 * `getAssetCacheStats` is the M7 test seam: it returns the
 * resident-memory footprint of the optional bounded LRU that
 * caches frozen asset bytes. Returns `null` when
 * `config.build.frozenAssetCache` is `"none"` (the M2 default).
 *
 * Advanced consumers who need the underlying Hono instance may call
 * `getHono(app)` (exported from this package) to access it. The Hono
 * type is not part of `App` so users who do not need Hono are not
 * forced to add it to their import map.
 */
export type App = {
  /** Run a request through the app and return a Response. */
  fetch(request: Request): Response | Promise<Response>;
  /**
   * Returns `{ size, count }` for the frozen-asset LRU, or `null`
   * when the cache is disabled. Test-only: production code should
   * not depend on this method.
   */
  getAssetCacheStats(): { readonly size: number; readonly count: number } | null;
};

/**
 * The framework HTTP app, augmented with the underlying Hono
 * instance for advanced middleware attachment or sub-app mounting.
 *
 * Constructed via `getHono(app)` from this package. The `hono`
 * field is omitted from the base `App` type so Hono is opt-in for
 * consumers who do not need it.
 */
export type AppAdvanced = App & {
  /** The underlying Hono instance. */
  readonly hono: Hono;
};

/** Options accepted by {@link import("./app.ts").createApp}. */
export type CreateAppOptions = {
  /**
   * Project root as a slash-normalized absolute path. Defaults to
   * `Deno.cwd()`. The config layer may interpret relative paths
   * (and rejects NUL bytes or escapes).
   */
  readonly root?: string;
  /**
   * Run mode. `"development"` (the default) tunes the config layer
   * for fast iteration; `"production"` is reserved for the M6/M7
   * build and serve paths.
   */
  readonly mode?: "development" | "production";
  /**
   * Path to a custom config file. Defaults to
   * `<root>/sprout.config.ts`. A missing file at the resolved path
   * causes the loader to fall back to defaults.
   */
  readonly configFile?: string;
};

/** Options accepted by {@link import("./app.ts").serve}. */
export type ServeOptions = CreateAppOptions & {
  /** Hostname to bind to. Defaults to the resolved config hostname. */
  readonly hostname?: string;
  /** Port to bind to. Defaults to the resolved config port. */
  readonly port?: number;
  /** Optional abort signal. When aborted, the server exits cleanly. */
  readonly signal?: AbortSignal;
};

/**
 * Props received by a page component (the default export of a route
 * module). `params` carries dynamic-segment captures (for example
 * `{ slug: "hello" }` for `/blog/hello`). `context` is the framework
 * request context with response helpers.
 */
export type PageProps<P = Readonly<Record<string, string>>> = {
  readonly params: P;
  readonly request: Request;
  readonly url: URL;
  readonly context: RequestContext;
};

/**
 * A method handler (GET, POST, etc.) on a route module. Receives
 * the framework request context and may return any `Response` or a
 * `Promise<Response>`. Returning a non-Response value is treated as
 * a server bug and surfaces as a 500 to the client.
 */
export type RouteHandler = (context: RequestContext) => Response | Promise<Response>;

/**
 * A value the framework can render into an HTML response body.
 *
 * The runtime calls `String(value)` on each element so JSX nodes,
 * strings, numbers, booleans, `bigint`, `null`, and `undefined` are
 * all accepted. `Response` instances are passed through unchanged.
 */
export type Renderable =
  | JSXNode
  | HtmlEscapedString
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined;

/** A page component (the default export of a route module). */
export type RoutePageComponent = (
  props: PageProps,
) => Renderable | Response | Promise<Renderable | Response>;

/**
 * The default-export shape of a route module: a page (default) plus
 * optional method handlers. `HEAD` is optional: a missing `HEAD`
 * falls back to `GET` and the body is stripped.
 */
export type RouteModule = {
  readonly default?: RoutePageComponent;
  readonly GET?: RouteHandler;
  readonly POST?: RouteHandler;
  readonly PUT?: RouteHandler;
  readonly PATCH?: RouteHandler;
  readonly DELETE?: RouteHandler;
  readonly OPTIONS?: RouteHandler;
  readonly HEAD?: RouteHandler;
};

/**
 * The framework request context exposed inside route handlers.
 *
 * It carries the inbound request, the parsed URL, the dynamic-segment
 * params, and a `locals` map for middleware-supplied data. The
 * response helpers (`html`, `json`, `text`, `redirect`, `render`)
 * return correctly-typed `Response` objects and never mutate the
 * request.
 */
export type RequestContext = {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly locals: Map<string, unknown>;
  /**
   * Send an HTML response. `value` is stringified with `String(value)`
   * so a Hono `JSXNode` or `HtmlEscapedString` can be passed directly.
   * Returns the resulting `Response`.
   */
  html(value: Renderable | Response, init?: ResponseInit): Response | Promise<Response>;
  /**
   * Send a JSON response. `value` is serialized with `JSON.stringify`.
   * The generic lets TypeScript infer the value type from the call site.
   */
  json<T>(value: T, init?: ResponseInit): Response;
  /** Send a plain-text response. */
  text(value: string, init?: ResponseInit): Response;
  /**
   * Send a redirect. `status` defaults to `302`. The location is
   * validated to be a string; a 4xx response is returned for invalid
   * locations to avoid leaking `null` locations as 500s.
   */
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response;
  /**
   * Render `value` as a full HTML page (with the framework's shell,
   * runtime script, and stylesheet). When called outside a
   * `RequestContext` built by `createApp`, this falls back to
   * `html(value, init)`.
   */
  render(value: Renderable | Response, init?: ResponseInit): Response | Promise<Response>;
};
