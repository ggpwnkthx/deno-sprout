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
import { buildRequestContext, type ShellInfo } from "./context.ts";
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
};

/** A loose shape for an imported route module. */
type LoadedRouteModule = {
  readonly default?: unknown;
  readonly GET?: unknown;
  readonly HEAD?: unknown;
  readonly POST?: unknown;
  readonly PUT?: unknown;
  readonly PATCH?: unknown;
  readonly DELETE?: unknown;
  readonly OPTIONS?: unknown;
};

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function asRouteModule(value: unknown): RouteModule {
  if (value === null || typeof value !== "object") {
    throw new CoreError(
      "ROUTE_INVALID_EXPORT",
      "route module is not an object",
      { moduleType: value === null ? "null" : typeof value },
    );
  }
  const m = value as LoadedRouteModule;
  return {
    default: isFunction(m.default) ? (m.default as RouteModule["default"]) : undefined,
    GET: isFunction(m.GET) ? (m.GET as RouteHandler) : undefined,
    HEAD: isFunction(m.HEAD) ? (m.HEAD as RouteHandler) : undefined,
    POST: isFunction(m.POST) ? (m.POST as RouteHandler) : undefined,
    PUT: isFunction(m.PUT) ? (m.PUT as RouteHandler) : undefined,
    PATCH: isFunction(m.PATCH) ? (m.PATCH as RouteHandler) : undefined,
    DELETE: isFunction(m.DELETE) ? (m.DELETE as RouteHandler) : undefined,
    OPTIONS: isFunction(m.OPTIONS) ? (m.OPTIONS as RouteHandler) : undefined,
  };
}

/** Load a route module via dynamic import. */
async function loadRouteModule(file: string): Promise<RouteModule> {
  const fileUrl = toFileUrl(file).href;
  let mod: Record<string, unknown>;
  try {
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
function wrapHtml(
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
    return new Response(html, {
      ...requestInit,
      headers: new Headers({
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": NOSNIFF,
        ...(requestInit?.headers ? Object.fromEntries(new Headers(requestInit.headers)) : {}),
      }),
    });
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
 * table. The function is `async` even when the handler is sync
 * because island registration requires dynamic imports.
 */
export async function renderRoute(options: RenderRouteOptions): Promise<Response> {
  const { manifest: _manifest, route, request, url, params, locals, shellInfo } = options;
  const method = request.method.toUpperCase();

  // The framework accepts only known HTTP methods; everything else
  // (custom verbs, typos) is treated as "method not implemented".
  // RFC 7231 says 501 (Not Implemented) is the right status for an
  // unknown method, but 405 (Method Not Allowed) with an Allow
  // header listing the framework's supported methods is the
  // closest match in the existing code family and gives operators
  // a clear picture of what the server accepts.
  if (!isHttpMethod(method)) {
    throw new CoreError(
      "ROUTE_METHOD_NOT_ALLOWED",
      `unsupported HTTP method ${JSON.stringify(request.method)}`,
      { method: request.method, methods: [...SUPPORTED_HTTP_METHODS] },
    );
  }

  // Pre-load the route module. Islands are pre-registered at app
  // startup via `warmupIslands`; the registry is process-global and
  // idempotent, so no per-request registration is needed.
  const module = await loadRouteModule(route.file);

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
        return new Response(null, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        });
      }
      return result;
    }
    if (method === "HEAD") {
      // Compute the headers from the would-be HTML response and
      // return an empty body with the same status and content-type.
      const body: JSXNode = htmlShell({
        title: undefined,
        body: result,
        stylesheetPublicPath: shellInfo.stylesheetPublicPath,
        runtimePublicPath: shellInfo.runtimePublicPath,
      });
      const sample = new Response(String(body), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return new Response(null, {
        status: sample.status,
        headers: sample.headers,
      });
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
      return new Response(null, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
    }
    return result;
  }
  // Non-Response return: wrap in the HTML shell.
  return wrapHtml(result, shellInfo);
}
