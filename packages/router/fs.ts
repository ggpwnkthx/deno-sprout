// fs.ts - File-system routing
import type { Hono } from "@hono/hono";
import type { MiddlewareHandler } from "@hono/hono";
import { join, resolve } from "@std/path";
import type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";
import { getRouteFiles } from "./lib/file.ts";
import { resolveLayoutChain, resolveMiddlewareChain } from "./groups.ts";
import { BoundedCache } from "./lib/cache.ts";
import {
  HandlerNotCallable,
  InvalidManifest,
  InvalidRouteOverride,
  MiddlewareNotCallable,
  RouteOutsideDirectory,
  RoutesDirNotFound,
} from "./lib/errors.ts";
import type { RouteConfig } from "./config.ts";

// Re-export for consumers
export type { RouteConfig, RouteManifestEntry, RoutesManifest };

// app: Hono<any> — fsRoutes calls app.use()/app.on()/app.notFound() which are
// all typed via Hono's own generics; using any here bridges the type gap between
// App (Hono<{ Variables: AppContextVariables }>) and the unconstrained Hono
// defaults, without forcing App to expose its Variables to router callers.
/**
 * Options for configuring `fsRoutes`.
 */
export interface FsRoutesOptions {
  // deno-lint-ignore no-explicit-any
  app: Hono<any>;
  /** Routes directory (default: "./routes"). */
  dir?: string;
  /** Called for each page route after handlers are registered. */
  onPage?: (opts: PageRouteOptions) => void;
}

/**
 * Callback options passed to `onPage` for each registered page route.
 */
export interface PageRouteOptions {
  app: Hono;
  pattern: string;
  layoutChain: string[];
  middlewareChain: string[];
  module: RouteModule;
}

/**
 * The public surface of a route file module. Any HTTP method name may be
 * exported in addition to `default` (the page component) and `handler`.
 */
export interface RouteModule {
  default?: unknown;
  handler?: unknown;
  GET?: unknown;
  POST?: unknown;
  PUT?: unknown;
  PATCH?: unknown;
  DELETE?: unknown;
  HEAD?: unknown;
  config?: RouteConfig;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;

// Module-level cache for layout files: path → loaded module.
// Bounded to 64 entries to prevent memory growth during long-running
// dev servers with many unique layout files.
const layoutModuleCache = new BoundedCache<string, RouteModule>(64);

// Module-level cache for middleware files: path → loaded module.
// Shares the same 64-entry capacity as layoutModuleCache, preventing
// repeated per-route imports of shared files.
const middlewareModuleCache = new BoundedCache<string, RouteModule>(64);

/**
 * Registers all route files from a directory as Hono handlers.
 *
 * Reserved files (`_error.tsx`, `_404.tsx`, `_middleware.ts`, `_layout.tsx`)
 * are registered first. Page routes are then registered with their full
 * middleware and layout chain composed. HTTP method handlers (`GET`, `POST`,
 * etc.) on the route module take precedence over the page component.
 *
 * The `onPage` callback is invoked once per page route after all handlers are
 * registered, enabling callers to collect layout/middleware chains and module
 * references without triggering double-imports.
 *
 * @param options - `{ app, dir?, onPage? }`. `app` is required.
 * @returns A promise that resolves when all routes are registered.
 * @example
 * ```ts
 * import { Hono } from "@hono/hono";
 * import { fsRoutes } from "@ggpwnkthx/sprout-router";
 *
 * const app = new Hono();
 * await fsRoutes({ app, dir: "./routes" });
 * ```
 */
export async function fsRoutes(options: FsRoutesOptions): Promise<void> {
  const { app, dir = "./routes" } = options;
  const routesDir = resolve(Deno.cwd(), dir);
  let routeDirInfo: Deno.FileInfo;
  try {
    routeDirInfo = await Deno.stat(routesDir);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new RoutesDirNotFound(dir);
    }
    throw e;
  }
  if (!routeDirInfo.isDirectory) {
    throw new RoutesDirNotFound(dir);
  }
  const routeFiles = await getRouteFiles(routesDir);
  const files: RouteFileLike[] = routeFiles.map((file) => ({
    filePath: file.filePath,
    pattern: file.urlPattern,
    isApi: false,
    isReserved: file.isReserved,
    kind: file.kind,
    skipInheritedLayouts: undefined,
    routeOverride: undefined,
    layoutChain: [],
    middlewareChain: [],
  }));
  await registerRoutes(app, files, routesDir, options);
}

/**
 * Registers routes from a pre-built manifest (e.g., produced by the build
 * pipeline) as Hono handlers. The manifest supplies all layout and middleware
 * chains directly, avoiding filesystem access.
 *
 * @param options - `{ app, manifest, onPage? }`. `app` and `manifest` are required.
 * @returns A promise that resolves when all routes are registered.
 */
export async function fsRoutesFromManifest(
  options: Omit<FsRoutesOptions, "dir"> & { manifest: RoutesManifest },
): Promise<void> {
  const { app, manifest, onPage } = options;
  if (!manifest || typeof manifest !== "object") {
    throw new InvalidManifest("manifest");
  }
  if (!Array.isArray(manifest.routes)) {
    throw new InvalidManifest("manifest.routes");
  }
  const files = manifest.routes.map((entry) => ({
    filePath: entry.filePath,
    pattern: entry.pattern,
    isApi: entry.isApi,
    isReserved: false,
    skipInheritedLayouts: entry.skipInheritedLayouts,
    routeOverride: entry.routeOverride,
    layoutChain: entry.layoutChain ?? [],
    middlewareChain: entry.middlewareChain ?? [],
  }));
  await registerRoutes(app, files, "", { app, onPage });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RouteFileLike {
  filePath: string;
  pattern: string;
  isApi: boolean;
  isReserved?: boolean;
  kind?: "layout" | "middleware" | "error" | "notFound";
  skipInheritedLayouts?: boolean;
  routeOverride?: string;
  layoutChain: string[];
  middlewareChain: string[];
}

interface OnPageEntry {
  pattern: string;
  layoutChain: string[];
  middlewareChain: string[];
  module: RouteModule;
}

async function registerRoutes(
  app: Hono,
  files: RouteFileLike[],
  routesDir: string,
  options: FsRoutesOptions,
): Promise<void> {
  const { onPage } = options;

  // Separate reserved files from page/API routes
  const reservedFiles = files.filter((f) => f.isReserved);
  const routeFiles = files.filter((f) => !f.isReserved);

  // Collect onPage data while registering routes to avoid double-imports
  const onPageEntries: OnPageEntry[] = [];

  // Register reserved handlers first
  await registerReserved(app, reservedFiles, routesDir);

  // Register page and API routes
  // Register page and API routes in parallel.
  // Hono's app.use/app.on are synchronous; only the imports inside
  // registerRoute are async, so parallel registration is safe.
  await Promise.all(
    routeFiles.map((file) =>
      registerRoute(app, file, routesDir, onPageEntries)
    ),
  );

  // Fire onPage callback once per page route, awaiting each to ensure
  // all async work (including composeLayouts) completes before fsRoutes
  // returns — prevents the SmartRouter matcher from being built before
  // all this.use() calls in App.init() are done.
  if (onPage) {
    for (const entry of onPageEntries) {
      await onPage({
        app,
        pattern: entry.pattern,
        layoutChain: entry.layoutChain,
        middlewareChain: entry.middlewareChain,
        module: entry.module,
      });
    }
  }
}

async function registerReserved(
  app: Hono,
  reservedFiles: RouteFileLike[],
  routesDir: string,
): Promise<void> {
  for (const file of reservedFiles) {
    const fileUrl = `file://${join(routesDir, file.filePath)}`;
    const mod: RouteModule = await import(fileUrl);

    switch (file.kind) {
      case "error": {
        if (mod.default) {
          app.onError((err, c) => {
            console.error(err);
            const error = err instanceof Error ? err : new Error(String(err));
            c.status(500);
            return c.render(
              (mod.default as (props: Record<string, unknown>) => unknown)({
                error,
                url: new URL(c.req.url, "http://localhost"),
              }) as unknown as string,
            );
          });
        }
        break;
      }
      case "notFound": {
        if (mod.default) {
          app.notFound((c) => {
            c.status(404);
            return c.render(
              (mod.default as (props: Record<string, unknown>) => unknown)({
                url: new URL(c.req.url, "http://localhost"),
              }) as unknown as string,
            );
          });
        }
        break;
      }
      case "middleware": {
        if (mod.default) {
          if (typeof mod.default !== "function") {
            throw new MiddlewareNotCallable(
              join(routesDir, file.filePath),
              typeof mod.default,
            );
          }
          app.use("*", asMiddleware(mod.default));
        }
        break;
      }
      case "layout": {
        // Layouts are resolved per-route via resolveLayoutChain
        break;
      }
    }
  }
}

async function registerRoute(
  app: Hono,
  file: RouteFileLike,
  routesDir: string,
  onPageEntries: OnPageEntry[],
): Promise<void> {
  const fileUrl = `file://${join(routesDir, file.filePath)}`;
  const mod: RouteModule = await import(fileUrl);
  const pattern = resolvePattern(file, mod.config);
  // Compute once for use in handler error messages
  const absFilePath = routesDir
    ? join(routesDir, file.filePath)
    : file.filePath;

  // Pure API route: isApi flag or no default export → only register method handlers, no JSX
  if (file.isApi || !mod.default) {
    for (const method of HTTP_METHODS) {
      const handler = mod[method];
      if (handler) {
        app.on(method.toLowerCase(), pattern, asHandler(handler, absFilePath));
      }
    }
    // onPage still fires for API routes with a default component
    if (mod.default) {
      const layoutChain = file.layoutChain.length > 0
        ? file.layoutChain
        : await resolveLayoutChain(absFilePath, routesDir);
      const middlewareChain = file.middlewareChain.length > 0
        ? file.middlewareChain
        : await resolveMiddlewareChain(absFilePath, routesDir);
      onPageEntries.push({
        pattern,
        layoutChain,
        middlewareChain,
        module: mod,
      });
    }
    return;
  }

  // Compute or use pre-computed chains
  // Always use absolute paths: file.filePath is already absolute in manifest mode,
  // or relative to routesDir in local mode.
  const layoutChain = file.layoutChain.length > 0
    ? file.layoutChain
    : await resolveLayoutChain(absFilePath, routesDir);
  const middlewareChain = file.middlewareChain.length > 0
    ? file.middlewareChain
    : await resolveMiddlewareChain(absFilePath, routesDir);

  // Page route: default component + optional method handlers + optional handler()
  const skipLayouts = file.skipInheritedLayouts ??
    mod.config?.skipInheritedLayouts ?? false;
  const resolvedLayouts = skipLayouts
    ? layoutChain.slice(1) // skipInheritedLayouts: skip root (first), keep nearest
    : layoutChain;

  // Pre-warm layoutModuleCache for every layout in the chain so that
  // renderPage (called on every request) finds them already loaded.
  // routesDir is passed so that loadLayoutModule can validate containment.
  await Promise.all(resolvedLayouts.map((l) => loadLayoutModule(l, routesDir)));

  // Pre-warm middleware modules for every middleware in the chain.
  await Promise.all(
    middlewareChain.map((m) => loadMiddlewareModule(m, routesDir)),
  );

  // Build the final handler: middleware → handler() → page component
  let finalHandler = resolvePageHandler(mod, resolvedLayouts);
  for (const mwPath of [...middlewareChain].reverse()) {
    const mwMod = await loadMiddlewareModule(mwPath, routesDir);
    if (mwMod.default) {
      if (typeof mwMod.default !== "function") {
        throw new MiddlewareNotCallable(mwPath, typeof mwMod.default);
      }
      finalHandler = compose(mwMod.default as MiddlewareHandler, finalHandler);
    }
  }

  // Register method-specific overrides first, then page handler as fallback
  for (const method of HTTP_METHODS) {
    const methodHandler = mod[method];
    if (methodHandler) {
      app.on(method.toLowerCase(), pattern, asHandler(methodHandler));
    }
  }

  // Page component handles any method not explicitly overridden
  app.use(pattern, finalHandler);

  // Collect onPage data — layout chains computed once above
  onPageEntries.push({ pattern, layoutChain, middlewareChain, module: mod });
}

/**
 * Resolve the URL pattern for a route file.
 *
 * Uses `routeOverride` from the route's `config` export if set and non-empty.
 * Rejects path-traversal patterns (`..`) with a descriptive error.
 * Falls back to `file.pattern` (the auto-derived pattern from the file path).
 * If both are absent, returns `"/"`.
 */
function resolvePattern(
  file: RouteFileLike,
  config?: RouteConfig,
): string {
  const override = config?.routeOverride;
  if (override !== undefined && override !== "") {
    if (
      override.includes("..") ||
      override.startsWith("../") ||
      override.startsWith("/..")
    ) {
      throw new InvalidRouteOverride(override);
    }
    return override;
  }
  return file.pattern || "/";
}

/**
 * Convert a raw handler function to a MiddlewareHandler.
 *
 * Return value determines the HTTP response:
 * - Response instance → returned as-is
 * - undefined/void  → 204 No Content (empty body, no page render)
 * - null  → 204 No Content (explicit null body)
 * - any other value  → 200 OK, body is String(value) or JSON
 *
 * This allows route handlers to return raw data (serialized JSON, plain text)
 * without wrapping in Response, while explicit undefined signals "skip page render."
 */
function asHandler(fn: unknown, path?: string): MiddlewareHandler {
  return async (c) => {
    if (typeof fn !== "function") {
      throw new HandlerNotCallable(
        path ?? "unknown",
        fn === null ? "null" : typeof fn,
      );
    }
    const handlerFn = fn as (
      c: Parameters<MiddlewareHandler>[0],
    ) => unknown;
    const result = await handlerFn(c);
    if (result instanceof Response) return result;
    if (result === undefined || result === null) {
      // Explicit undefined or null produces 204 No Content.
      // This prevents fall-through to the page component.
      return new Response(null, { status: 204 });
    }
    // Serialize the value as the response body.
    // Objects (not null) are JSON-serialized; primitives are stringified.
    const body = typeof result === "object"
      ? JSON.stringify(result)
      : String(result);
    return new Response(body, {
      status: 200,
      headers: typeof result === "object"
        ? {
          "Content-Type": "application/json",
        }
        : {},
    });
  };
}

/**
 * Guard that converts a middleware value to a MiddlewareHandler, throwing a
 * descriptive TypeError if the value is not callable at invoke time.
 */
function asMiddleware(fn: unknown): MiddlewareHandler {
  if (typeof fn !== "function") {
    throw new TypeError(
      `Expected middleware to be a function, got ${typeof fn}: ${
        fn === null ? "null" : String(fn)
      }`,
    );
  }
  return fn as MiddlewareHandler;
}

/**
 * Compose two middleware handlers into one.
 *
 * The inner handler runs first. If it returns a Response (short-circuit),
 * the outer handler is never called. Otherwise, `next()` is called to
 * dispatch to the outer handler, and its response is returned.
 *
 * Type note: Hono's `MiddlewareHandler` allows `next: () => Promise<void>`
 * to be called and return, while the outer middleware itself may short-circuit
 * by returning `Response | Promise<Response>`. The type system requires a cast
 * through `unknown` to reconcile the declared `() => Promise<void>` signature
 * of `next` with the actual `() => Promise<Response>` behavior at runtime.
 * This is the same pattern Hono uses internally in its own compose utility.
 * The `as unknown as MiddlewareHandler` cast acknowledges that the resolved
 * return type differs from the declared return type without suppressing errors.
 */
function compose(
  inner: MiddlewareHandler,
  outer: MiddlewareHandler,
): MiddlewareHandler {
  return (c, next) =>
    inner(
      c,
      () =>
        (outer as unknown as (
          c: Parameters<MiddlewareHandler>[0],
          n: () => Promise<void>,
        ) => Promise<void>)(c, next),
    );
}

/**
 * Build the handler for a page route.
 *
 * - If `handler()` returns a Response → send it immediately, skip page rendering.
 * - If `handler()` returns data → pass it to the page component as `data`.
 * - If `handler()` returns undefined → render page component with layout chain.
 */
function resolvePageHandler(
  mod: RouteModule,
  layoutChain: string[],
): MiddlewareHandler {
  const page = mod.default as
    | ((props: Record<string, unknown>) => unknown)
    | undefined;
  const handler = mod.handler as
    | ((c: Parameters<MiddlewareHandler>[0]) => unknown)
    | undefined;

  if (handler) {
    return async (c) => {
      const result = await handler(c);
      if (result instanceof Response) return result;
      // Pass handler return value as `data` to the page component
      return renderPage(c, page, layoutChain, result);
    };
  }

  return (c) => renderPage(c, page, layoutChain, undefined);
}

async function renderPage(
  c: Parameters<MiddlewareHandler>[0],
  page: ((props: Record<string, unknown>) => unknown) | undefined,
  layoutChain: string[],
  loaderData?: unknown,
): Promise<Response> {
  // Build layout wrapper chain: innermost page, outermost root layout
  // layoutChain is ordered root → leaf (most distant first)
  let component: unknown = page ?? (() => c.text("OK"));

  for (const layoutPath of [...layoutChain].reverse()) {
    const layoutMod = await loadLayoutModule(layoutPath);
    const layoutFn = layoutMod.default as
      | ((props: Record<string, unknown>) => unknown)
      | undefined;
    if (layoutFn) {
      const currentComponent = component as (
        props: Record<string, unknown>,
      ) => unknown;
      // Pass the RESULT of calling currentComponent (rendered JSX) as children
      component = (props: Record<string, unknown>) =>
        layoutFn({ ...props, children: currentComponent(props) });
    }
  }

  const props = {
    data: loaderData,
    params: c.req.param(),
    url: new URL(c.req.url, "http://localhost"),
    children: undefined,
  };
  const result =
    await (component as (props: Record<string, unknown>) => unknown)(props);

  if (result instanceof Response) return result;
  if (typeof result === "string") return c.html(result);
  // result is a JSX element - use c.render to convert to HTML
  return c.render(result as unknown as string);
}

/** Load a middleware module with module-level caching.
 *
 * The module is cached by absolute path. On cache miss the file's
 * canonical path is verified against `routesDir` before importing.
 * Cached entries are returned without any filesystem access.
 * When `routesDir` is empty (manifest mode), the process cwd is used as
 * the containment boundary.
 *
 * @param mwPath - Absolute path to the middleware file.
 * @param routesDir - Canonical routes directory to validate containment against.
 */
async function loadMiddlewareModule(
  mwPath: string,
  routesDir?: string,
): Promise<RouteModule> {
  const cached = middlewareModuleCache.get(mwPath);
  if (cached) return cached;
  // Only validate path on first load (cache miss)
  const canonPath = await Deno.realPath(mwPath);
  const guardDir = routesDir || Deno.cwd();
  if (!canonPath.startsWith(guardDir + "/")) {
    throw new RouteOutsideDirectory(canonPath, guardDir);
  }
  const mod: RouteModule = await import(`file://${mwPath}`);
  middlewareModuleCache.set(mwPath, mod);
  return mod;
}

/** Load a layout module with module-level caching.
 *
 * The module is cached by absolute path. On cache miss the file's
 * canonical path is verified against `routesDir` before importing.
 * Cached entries are returned without any filesystem access.
 * When `routesDir` is empty (manifest mode), the process cwd is used as
 * the containment boundary.
 *
 * @param layoutPath - Absolute path to the layout file.
 * @param routesDir - Canonical routes directory to validate containment against.
 */
async function loadLayoutModule(
  layoutPath: string,
  routesDir?: string,
): Promise<RouteModule> {
  const cached = layoutModuleCache.get(layoutPath);
  if (cached) return cached;
  // Only validate path on first load (cache miss)
  const canonPath = await Deno.realPath(layoutPath);
  const guardDir = routesDir || Deno.cwd();
  if (!canonPath.startsWith(guardDir + "/")) {
    throw new RouteOutsideDirectory(canonPath, guardDir);
  }
  const mod: RouteModule = await import(`file://${layoutPath}`);
  layoutModuleCache.set(layoutPath, mod);
  return mod;
}
