// Route dispatch and rendering for `@sprout/core`.
//
// One public function: `renderRoute`, which takes a parsed request,
// the resolved manifest, and the matched route entry, loads the
// route module, dispatches to the right method handler (with
// HEAD → GET fallback and body stripping), and wraps the result
// in the HTML shell when the handler returns JSX.
//
// Island registration is performed once at app startup via
// `warmupIslands` in `warmup_islands.ts`, not per-request.
//
import { toFileUrl } from "@std/path";
import { causeMessage, NOSNIFF } from "@sprout/utils";
import type { ResolvedConfig } from "@sprout/config";
import type { Manifest, RouteEntry } from "@sprout/compiler";
import { htmlShell } from "./html_shell.tsx";
import { buildRequestContext, type ShellInfo, withSecurityHeaders } from "./context.ts";
import { CoreError } from "./errors.ts";
import type { HttpMethod } from "@sprout/utils";
import { isHttpMethod, SUPPORTED_HTTP_METHODS } from "@sprout/utils";
import type { PageProps, RequestContext, RouteHandler, RouteModule } from "./types.ts";
import type { JSXNode } from "@hono/hono/jsx";

/** Inputs to {@link renderRoute}. */
export type RenderRouteOptions = {
  readonly config: ResolvedConfig;
  readonly manifest: Manifest;
  readonly route: RouteEntry;
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly locals: Map<string, unknown>;
  /** Shell metadata captured by `createApp`. */
  readonly shellInfo: ShellInfo;
  /**
   * Pre-loaded route modules from {@link loadRouteModules}. Enables
   * synchronous lookup instead of per-request `await import()`.
   */
  readonly routeModules: Map<string, RouteModule>;
};

/** A loose shape for an imported route module. */
type RouteModuleShape = {
  readonly default?: (...args: never) => unknown;
  readonly GET?: (...args: unknown[]) => unknown;
  readonly HEAD?: (...args: unknown[]) => unknown;
  readonly POST?: (...args: unknown[]) => unknown;
  readonly PUT?: (...args: unknown[]) => unknown;
  readonly PATCH?: (...args: unknown[]) => unknown;
  readonly DELETE?: (...args: unknown[]) => unknown;
  readonly OPTIONS?: (...args: unknown[]) => unknown;
};

/** The set of method-key names on a route module. */
const ROUTE_METHOD_KEYS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/**
 * Validate that `value` has the shape of a route module. Used as a
 * type guard before the final cast to {@link RouteModule}.
 */
function isRouteModuleShape(value: unknown): value is RouteModuleShape {
  if (value === null || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  for (const key of ROUTE_METHOD_KEYS) {
    const v = m[key];
    if (v !== undefined && typeof v !== "function") return false;
  }
  return true;
}

/**
 * Validate and coerce an imported module to a {@link RouteModule}.
 * Throws {@link CoreError} with code `ROUTE_INVALID_EXPORT` for
 * non-objects, non-function method exports, or non-function defaults.
 * Throws {@link CoreError} with code `ROUTE_IMPORT_FAILED` when the
 * file cannot be loaded.
 *
 * This is the only place that decides "what is a valid route module".
 * A new `RouteModule` field can be added here without breaking
 * existing callers.
 */
function asRouteModule(value: unknown): RouteModule {
  if (value === null || typeof value !== "object") {
    throw new CoreError(
      "ROUTE_INVALID_EXPORT",
      "route module is not an object",
      { moduleType: value === null ? "null" : typeof value },
    );
  }
  if (!isRouteModuleShape(value)) {
    const m = value as Record<string, unknown>;
    // Identify the first offending method key for the error message.
    for (const key of ROUTE_METHOD_KEYS) {
      const v = m[key];
      if (v !== undefined && typeof v !== "function") {
        throw new CoreError(
          "ROUTE_INVALID_EXPORT",
          `route module field "${key}" is not a function`,
          { key, type: typeof v },
        );
      }
    }
    // Non-function default export.
    if (m["default"] !== undefined) {
      throw new CoreError(
        "ROUTE_INVALID_EXPORT",
        "route module default export is not a function",
        { key: "default", type: typeof m["default"] },
      );
    }
    // Should not reach here, but the fallback covers it.
    throw new CoreError(
      "ROUTE_INVALID_EXPORT",
      "route module is not an object",
      { moduleType: typeof value },
    );
  }
  const m = value as RouteModuleShape;
  return {
    default: m.default as RouteModule["default"],
    GET: m.GET as RouteModule["GET"],
    HEAD: m.HEAD as RouteModule["HEAD"],
    POST: m.POST as RouteModule["POST"],
    PUT: m.PUT as RouteModule["PUT"],
    PATCH: m.PATCH as RouteModule["PATCH"],
    DELETE: m.DELETE as RouteModule["DELETE"],
    OPTIONS: m.OPTIONS as RouteModule["OPTIONS"],
  };
}

/**
 * Load a single route module via dynamic import. Used at startup by
 * {@link loadRouteModules}; not used per-request after pre-loading.
 */
async function loadRouteModule(file: string): Promise<RouteModule> {
  const fileUrl = toFileUrl(file).href;
  let mod: Record<string, unknown>;
  try {
    // The specifier is the user's own route module file, pre-loaded at
    // startup via `loadRouteModules`. JSR's `publish` analyzer cannot
    // statically analyze this dynamic import; the resulting
    // `unanalyzable-dynamic-import` warning is expected and harmless
    // (the specifier is resolved at startup in the consumer's
    // own environment).
    mod = await import(fileUrl);
  } catch (cause) {
    throw new CoreError(
      "ROUTE_IMPORT_FAILED",
      `failed to import route module ${file}`,
      { file, cause: causeMessage(cause) },
    );
  }
  return asRouteModule(mod);
}

/**
 * Pre-load all route modules from a manifest at startup and return
 * them as a map keyed by file path. Syntax errors or missing exports
 * surface as typed {@link CoreError} during this call rather than on
 * the first request.
 *
 * @param manifest A validated manifest from {@link buildApp}.
 * @returns A map from route file path to the loaded {@link RouteModule}.
 */
export async function loadRouteModules(manifest: Manifest): Promise<Map<string, RouteModule>> {
  const entries = await Promise.all(
    manifest.routes.map(async (r) => {
      const mod = await loadRouteModule(r.file);
      return [r.file, mod] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Strip the body from a Response for HEAD requests while preserving
 * the status and headers (including content-type).
 */
function stripBody(response: Response, contentType: string): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers({
      "content-type": contentType,
      "x-content-type-options": NOSNIFF,
      ...Object.fromEntries(response.headers),
    }),
  });
}

/** Compute the set of methods present on a route module. */
function supportedMethods(module: RouteModule): HttpMethod[] {
  const out: HttpMethod[] = [];
  for (const m of SUPPORTED_HTTP_METHODS) {
    if (module[m] !== undefined) {
      out.push(m);
    }
  }
  // A page default is implicitly a GET/HEAD handler.
  if (module.default !== undefined) {
    if (!out.includes("GET")) {
      out.push("GET");
    }
    if (!out.includes("HEAD")) {
      out.push("HEAD");
    }
  }
  // Stable order: SUPPORTED_METHODS order, then de-duplicate.
  return Array.from(new Set(out));
}

/**
 * Wrap a renderable value (a `JSXNode`, an `HtmlEscapedString`, a
 * string, ...) in the HTML shell and return a `Response` with a
 * `text/html` content type.
 */
export function wrapHtml(
  value: unknown,
  shellInfo: ShellInfo,
  requestInit?: ResponseInit,
): Response {
  if (value === null || value === undefined) {
    throw new CoreError(
      "ROUTE_RENDER_FAILED",
      "page did not return a renderable value; the default export must return a JSX node, a string, or a Response",
      { value: String(value) },
    );
  }
  let body: JSXNode;
  try {
    body = htmlShell({
      title: undefined,
      body: value,
      stylesheetPublicPath: shellInfo.stylesheetPublicPath,
      runtimePublicPath: shellInfo.runtimePublicPath,
    });
  } catch (cause) {
    throw new CoreError(
      "ROUTE_RENDER_FAILED",
      `html shell construction threw: ${causeMessage(cause)}`,
      { cause: causeMessage(cause) },
    );
  }
  try {
    const html = String(body);
    return new Response(html, withSecurityHeaders(requestInit, "text/html; charset=utf-8"));
  } catch (cause) {
    throw new CoreError(
      "ROUTE_RENDER_FAILED",
      `html serialization threw: ${causeMessage(cause)}`,
      { cause: causeMessage(cause) },
    );
  }
}

/**
 * Render a route response. See the M3 spec for the full dispatch
 * table. The function is `async` because island registration requires
 * dynamic imports (islands are pre-warmed at startup; the function
 * itself is sync for route module lookup after pre-loading).
 */
export async function renderRoute(options: RenderRouteOptions): Promise<Response> {
  const { route, request, url, params, locals, shellInfo, routeModules } = options;
  const method = request.method.toUpperCase();

  // The framework accepts only known HTTP methods; everything else
  // (custom verbs, typos) is treated as "method not implemented".
  // RFC 7231 §6.6.2 specifies 501 (Not Implemented) for unknown
  // methods. The error detail carries the server's supported list
  // so operators can diagnose the mismatch.
  if (!isHttpMethod(method)) {
    throw new CoreError(
      "ROUTE_METHOD_NOT_IMPLEMENTED",
      `unsupported HTTP method ${JSON.stringify(request.method)}`,
      { method: request.method, methods: [...SUPPORTED_HTTP_METHODS] },
    );
  }

  // Look up the pre-loaded route module (loaded once at startup via
  // `loadRouteModules`). No per-request dynamic import.
  const module = routeModules.get(route.file);
  if (module === undefined) {
    // This should never happen: `buildApp` pre-loads all manifest
    // routes before registering any Hono handlers.
    throw new CoreError(
      "ROUTE_IMPORT_FAILED",
      `route module for ${route.file} was not pre-loaded`,
      { file: route.file },
    );
  }

  // Build the request context for handler invocation.
  const ctx: RequestContext = buildRequestContext({
    request,
    url,
    params,
    locals,
    shellInfo,
  });

  // -----------------------------------------------------------------
  // Method dispatch
  // -----------------------------------------------------------------
  const explicit = module[method];
  if (explicit !== undefined) {
    return await invokeHandler(explicit, ctx, shellInfo, method);
  }

  // HEAD falls back to GET. Body is stripped later.
  if (method === "HEAD" && module.GET !== undefined) {
    return await invokeHandler(module.GET, ctx, shellInfo, method);
  }

  // GET / HEAD fall back to the page default.
  if ((method === "GET" || method === "HEAD") && module.default !== undefined) {
    const pageProps: PageProps = { params, request, url, context: ctx };
    let result: unknown;
    try {
      result = await module.default(pageProps);
    } catch (cause) {
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `page default for ${url.pathname} threw during render`,
        { pathname: url.pathname, cause: causeMessage(cause) },
      );
    }
    if (result instanceof Response) {
      // For HEAD we still strip the body to keep the wire contract.
      if (method === "HEAD") {
        return stripBody(result, result.headers.get("content-type") ?? "text/html; charset=utf-8");
      }
      return result;
    }
    if (method === "HEAD") {
      // Compute the headers from the would-be HTML response and
      // return an empty body with the same status and content-type.
      try {
        const body: JSXNode = htmlShell({
          title: undefined,
          body: result,
          stylesheetPublicPath: shellInfo.stylesheetPublicPath,
          runtimePublicPath: shellInfo.runtimePublicPath,
        });
        // Harvest the content-type from the serialized shell.
        const sample = new Response(String(body), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
        return stripBody(sample, "text/html; charset=utf-8");
      } catch (cause) {
        throw new CoreError(
          "ROUTE_RENDER_FAILED",
          `page default for ${url.pathname} threw during render`,
          { pathname: url.pathname, cause: causeMessage(cause) },
        );
      }
    }
    return wrapHtml(result, shellInfo);
  }

  // No handler and no page default that matches. Build the
  // `Allow` header from the methods the module does support.
  const allowed = supportedMethods(module);
  if (allowed.length === 0) {
    // No handlers at all: treat as "no route".
    throw new CoreError(
      "ROUTE_NOT_FOUND",
      `route ${JSON.stringify(url.pathname)} has no handlers`,
      { pathname: url.pathname },
    );
  }
  throw new CoreError(
    "ROUTE_METHOD_NOT_ALLOWED",
    `method ${method} not allowed on ${url.pathname}`,
    { pathname: url.pathname, method, methods: allowed },
  );
}

/**
 * Call a method handler and coerce the result to a `Response`. The
 * handler may return any of:
 *
 *   - a `Response` (returned as-is, except HEAD body is stripped);
 *   - a `JSXNode` / `HtmlEscapedString` / other value (wrapped in
 *     the HTML shell with `text/html; charset=utf-8`);
 *   - a `Promise` of either of the above.
 */
async function invokeHandler(
  handler: RouteHandler,
  ctx: RequestContext,
  shellInfo: ShellInfo,
  method: HttpMethod,
): Promise<Response> {
  let result: unknown;
  try {
    result = await handler(ctx);
  } catch (cause) {
    throw new CoreError(
      "ROUTE_RENDER_FAILED",
      `handler for ${ctx.url.pathname} threw`,
      { pathname: ctx.url.pathname, method, cause: causeMessage(cause) },
    );
  }
  if (result instanceof Response) {
    if (method === "HEAD") {
      return stripBody(result, result.headers.get("content-type") ?? "text/html; charset=utf-8");
    }
    return result;
  }
  // Non-Response return: wrap in the HTML shell.
  return wrapHtml(result, shellInfo);
}
