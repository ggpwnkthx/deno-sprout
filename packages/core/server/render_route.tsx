// Route dispatch and rendering for `@sprout/core`.
//
// One public function: `renderRoute`, which takes a parsed request,
// the resolved manifest, and the matched route entry, loads the
// route module, registers every island from the manifest with the
// server-side island registry, dispatches to the right method
// handler (with HEAD → GET fallback and body stripping), and wraps
// the result in the HTML shell when the handler returns JSX.
//
import { toFileUrl } from "@std/path";
import { registerIslandComponent } from "@sprout/jsx/server/island-registry";
import type { IslandMetadata } from "@sprout/jsx/server/island-registry";
import type { ResolvedConfig } from "@sprout/config";
import type { Manifest, RouteEntry } from "@sprout/compiler";
import { htmlShell } from "./html_shell.tsx";
import { buildRequestContext, type ShellInfo } from "./context.ts";
import { CoreError } from "./errors.ts";
import type { HttpMethod } from "./http_methods.ts";
import { isHttpMethod, SUPPORTED_METHODS } from "./http_methods.ts";
import type { PageProps, RequestContext, RouteHandler, RouteModule } from "./types.ts";
import type { JSXNode } from "jsr:@hono/hono@4.12.24/jsx";

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

/**
 * Pre-load and register every island from the manifest. Registration
 * is idempotent for a module identity, so repeated requests can safely
 * call this without clearing the process-global registry. Avoiding a
 * request-time clear keeps concurrent renders from observing an empty
 * or partial registry while another request awaits dynamic imports.
 */
async function registerManifestIslands(manifest: Manifest): Promise<void> {
  for (const island of manifest.islands) {
    const fileUrl = toFileUrl(island.file).href;
    const mod = await import(fileUrl) as Record<string, unknown>;
    const component = mod[island.exportName];
    if (component === undefined || component === null) {
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `island ${JSON.stringify(island.id)} has no default export`,
        { id: island.id, file: island.file },
      );
    }
    if (typeof component !== "function" && typeof component !== "object") {
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `island ${JSON.stringify(island.id)} default export is not a component`,
        { id: island.id, file: island.file, type: typeof component },
      );
    }
    const metadata: IslandMetadata = {
      id: island.id,
      src: island.publicPath,
    };
    registerIslandComponent(component, metadata);
  }
}

/** Load a route module via dynamic import. */
async function loadRouteModule(file: string): Promise<RouteModule> {
  const fileUrl = toFileUrl(file).href;
  let mod: Record<string, unknown>;
  try {
    mod = await import(fileUrl);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new CoreError(
      "ROUTE_IMPORT_FAILED",
      `failed to import route module ${file}`,
      { file, cause: message },
    );
  }
  return asRouteModule(mod);
}

/** Compute the set of methods present on a route module. */
function supportedMethods(module: RouteModule): HttpMethod[] {
  const out: HttpMethod[] = [];
  for (const m of SUPPORTED_METHODS) {
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
  const body: JSXNode = htmlShell({
    title: undefined,
    body: value,
    stylesheetPublicPath: shellInfo.stylesheetPublicPath,
    runtimePublicPath: shellInfo.runtimePublicPath,
  });
  return new Response(String(body), {
    ...requestInit,
    headers: new Headers({
      "content-type": "text/html; charset=utf-8",
      ...(requestInit?.headers ? Object.fromEntries(new Headers(requestInit.headers)) : {}),
    }),
  });
}

/**
 * Render a route response. See the M3 spec for the full dispatch
 * table. The function is `async` even when the handler is sync
 * because island registration requires dynamic imports.
 */
export async function renderRoute(options: RenderRouteOptions): Promise<Response> {
  const { manifest, route, request, url, params, locals, shellInfo } = options;
  const method = request.method.toUpperCase();

  // The framework accepts only known HTTP methods; everything else
  // (custom verbs, typos) is treated as "no handler" and 404s.
  if (!isHttpMethod(method)) {
    throw new CoreError(
      "ROUTE_NOT_FOUND",
      `unsupported HTTP method ${JSON.stringify(request.method)}`,
      { method: request.method },
    );
  }

  // Pre-load the route module and every island module referenced by
  // the manifest. Both are dynamic imports, so the order matters
  // for `registerIslandComponent` to see the route's component
  // references by identity.
  const module = await loadRouteModule(route.file);
  await registerManifestIslands(manifest);

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
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `page default for ${url.pathname} threw during render`,
        { pathname: url.pathname, cause: message },
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
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new CoreError(
      "ROUTE_RENDER_FAILED",
      `handler for ${ctx.url.pathname} threw`,
      { pathname: ctx.url.pathname, method, cause: message },
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
