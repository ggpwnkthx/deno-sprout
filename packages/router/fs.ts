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
import type { RouteConfig } from "./config.ts";

// Re-export for consumers
export type { RouteConfig, RouteManifestEntry, RoutesManifest };

export interface FsRoutesOptions {
  app: Hono;
  /** Routes directory (default: "./routes"). */
  dir?: string;
  /** Called for each page route after handlers are registered. */
  onPage?: (opts: PageRouteOptions) => void;
}

export interface PageRouteOptions {
  app: Hono;
  pattern: string;
  layoutChain: string[];
  middlewareChain: string[];
  module: RouteModule;
}

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

export async function fsRoutes(options: FsRoutesOptions): Promise<void> {
  const { app, dir = "./routes" } = options;
  const routesDir = resolve(Deno.cwd(), dir);
  const routeFiles = await getRouteFiles(routesDir);
  const files: RouteFileLike[] = routeFiles.map((file) => ({
    filePath: file.filePath,
    pattern: file.urlPattern,
    isApi: false,
    isReserved: file.isReserved,
    kind: file.kind,
    skipInheritedLayouts: false,
    routeOverride: undefined,
    layoutChain: [],
    middlewareChain: [],
  }));
  await registerRoutes(app, files, routesDir, options);
}

export async function fsRoutesFromManifest(
  options: Omit<FsRoutesOptions, "dir"> & { manifest: RoutesManifest },
): Promise<void> {
  const { app, manifest, onPage } = options;
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
  skipInheritedLayouts: boolean;
  routeOverride?: string;
  layoutChain: string[];
  middlewareChain: string[];
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

  // Register reserved handlers first
  await registerReserved(app, reservedFiles, routesDir);

  // Register page and API routes
  for (const file of routeFiles) {
    await registerRoute(app, file, routesDir);
  }

  // Fire onPage callback for each page route
  if (onPage) {
    for (const file of routeFiles) {
      if (file.isApi) continue;
      const fileUrl = `file://${join(routesDir, file.filePath)}`;
      const mod: RouteModule = await import(fileUrl);
      if (!mod.default) continue;

      const pattern = resolvePattern(file, mod.config);
      // Use pre-computed chains or compute on the fly
      const layoutChain = file.layoutChain.length > 0
        ? file.layoutChain
        : await resolveLayoutChain(file.filePath, routesDir);
      const middlewareChain = file.middlewareChain.length > 0
        ? file.middlewareChain
        : await resolveMiddlewareChain(file.filePath, routesDir);
      onPage({
        app,
        pattern,
        layoutChain,
        middlewareChain,
        module: mod,
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
): Promise<void> {
  const fileUrl = `file://${join(routesDir, file.filePath)}`;
  const mod: RouteModule = await import(fileUrl);
  const pattern = resolvePattern(file, mod.config);

  // Pure API route: isApi flag or no default export → only register method handlers, no JSX
  if (file.isApi || !mod.default) {
    for (const method of HTTP_METHODS) {
      const handler = mod[method];
      if (handler) {
        app.on(method.toLowerCase(), pattern, asHandler(handler));
      }
    }
    return;
  }

  // Compute or use pre-computed chains
  // Always use absolute paths: file.filePath is already absolute in manifest mode,
  // or relative to routesDir in local mode.
  const absFilePath = routesDir
    ? join(routesDir, file.filePath)
    : file.filePath;
  const layoutChain = file.layoutChain.length > 0
    ? file.layoutChain
    : await resolveLayoutChain(absFilePath, routesDir);
  const middlewareChain = file.middlewareChain.length > 0
    ? file.middlewareChain
    : await resolveMiddlewareChain(absFilePath, routesDir);

  // Page route: default component + optional method handlers + optional handler()
  const skipLayouts = file.skipInheritedLayouts ??
    mod.config?.skipInheritedLayouts ?? false;
  const resolvedLayouts = skipLayouts ? layoutChain.slice(-1) : layoutChain;

  // Build the final handler: middleware → handler() → page component
  let finalHandler = resolvePageHandler(mod, resolvedLayouts);
  for (const mwPath of [...middlewareChain].reverse()) {
    const mwMod: RouteModule = await import(`file://${mwPath}`);
    if (mwMod.default) {
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
}

function resolvePattern(
  file: RouteFileLike,
  config?: RouteConfig,
): string {
  return (config?.routeOverride ?? file.pattern) || "/";
}

function asHandler(fn: unknown): MiddlewareHandler {
  return async (c) => {
    const handlerFn = fn as (
      c: Parameters<MiddlewareHandler>[0],
    ) => unknown;
    const result = await handlerFn(c);
    if (result instanceof Response) return result;
    // Return empty response to prevent fall-through to page component
    // when handler is defined but returns undefined/void
    return new Response(null, { status: 204 });
  };
}

function asMiddleware(fn: unknown): MiddlewareHandler {
  return fn as MiddlewareHandler;
}

function compose(
  inner: MiddlewareHandler,
  outer: MiddlewareHandler,
): MiddlewareHandler {
  return async (c, next) => {
    await inner(c, async () => {
      await outer(c, next);
    });
  };
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
    const layoutMod: RouteModule = await import(`file://${layoutPath}`);
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
    url: new URL(c.req.url),
    children: undefined,
  };
  const result =
    await (component as (props: Record<string, unknown>) => unknown)(props);

  if (result instanceof Response) return result;
  if (typeof result === "string") return c.html(result);
  // result is a JSX element - use c.render to convert to HTML
  return c.render(result as unknown as string);
}
