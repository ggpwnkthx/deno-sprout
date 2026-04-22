/**
 * Development server with HMR support.
 *
 * This module wires together the Sprout core `App`, the island bundler
 * middleware, the HMR WebSocket handler, and the file watcher into a single
 * development-time Hono application.
 *
 * @module
 */
import { App } from "@ggpwnkthx/sprout-core/app";
import { createHmrHandler, watchFiles } from "./hmr.ts";
import { devIslandBundler } from "./lib/bundler.ts";
import { dirname, join } from "@std/path";
import type { MiddlewareHandler } from "@hono/hono";

// WeakMap from App → its watcher close function.
// Avoids mutating App with a private property; the watcher lifetime is managed
// externally and the entry disappears when the App is garbage-collected.
// Exported so tests can retrieve the watcher to close it after use.
export const watcherMap: WeakMap<App, { close: () => void }> = new WeakMap();

// Derive the monorepo root from this file's location.
const MONOREPO_ROOT = dirname(
  dirname(dirname(new URL(import.meta.url).pathname)),
);

export interface DevServerOptions {
  /** Project root directory. Defaults to `Deno.cwd()`. */
  root?: string;
}

// HMR script injected into HTML pages
const HMR_SCRIPT = `<script type="module">
const ws = new WebSocket("ws://"+location.host+"/_sprout/hmr");
ws.addEventListener("message", (e) => {
  let ev;
  try { ev = JSON.parse(e.data); } catch { return; }
  if (ev.type === "css-update") {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const u = new URL(l.href); u.searchParams.set("_t", Date.now()); l.href = u;
    });
  } else { location.reload(); }
});
</script>`;

/**
 * Middleware that injects HMR client script into HTML responses.
 * Exported for unit testing.
 *
 * Note: This reads the entire response body into memory via c.res.text() and
 * rebuilds it as a new Response. This buffers the full HTML payload — it is
 * intentional for the dev-server use case but must NOT be used in production
 * paths where streaming or large-page performance matters.
 */
export function hmrInjector(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const ct = c.res.headers.get("Content-Type") ?? "";
    if (!ct.includes("text/html")) return;
    const body = await c.res.text();
    if (!body.includes("</body>")) return;
    c.res = new Response(
      body.replace("</body>", `${HMR_SCRIPT}</body>`),
      { status: c.res.status, headers: c.res.headers },
    );
  };
}

/**
 * Development server with HMR support.
 *
 * Creates a Hono app configured for a Sprout development workflow:
 *
 * - Phase 1 routing and JSX rendering (via `@ggpwnkthx/sprout-core` `App`)
 * - On-the-fly island bundling at `/_sprout/islands/{name}.js`
 * - Hydration runtime at `/_sprout/hydrate.js`
 * - Mount runtime at `/_sprout/runtime/mount.js`
 * - HMR WebSocket at `/_sprout/hmr`
 * - HMR client script injected into every HTML response
 * - File watcher that broadcasts FS change events to connected browsers
 *
 * The returned `App` is not yet running — the caller is responsible for
 * passing it to `Deno.serve` or an equivalent HTTP server.
 *
 * @example
 * ```ts
 * import { createDevServer } from "./server.ts";
 *
 * const app = await createDevServer({ root: "./my-app" });
 * Deno.serve(app.fetch);
 * ```
 *
 * @param options - Optional configuration for the dev server.
 * @param options.root - Project root directory. Defaults to `Deno.cwd()`.
 * @returns A configured `App` instance, ready to be served.
 */
export async function createDevServer(
  options?: DevServerOptions,
): Promise<App> {
  const root = options?.root ?? Deno.cwd();

  // Paths
  const islandsDir = join(root, "islands");
  const routesDir = join(root, "routes");
  const staticDir = join(root, "static");
  // Runtime and mount paths point to the monorepo's islands package, not the project
  const runtimePath = join(
    MONOREPO_ROOT,
    "packages",
    "islands",
    "lib",
    "runtime.ts",
  );
  const mountPath = join(
    MONOREPO_ROOT,
    "packages",
    "islands",
    "lib",
    "mount.ts",
  );

  // Create App instance
  const app = new App({
    root,
    routesDir: "routes",
    staticDir: "static",
    distDir: "_dist",
  });

  // Create island bundler middleware
  const { middleware: islandBundler, invalidate } = devIslandBundler({
    islandsDir,
    runtimePath,
    mountPath,
  });

  // Register island bundler before init so /_sprout/islands/*.js is handled
  app.use("/_sprout/islands/:name.js", islandBundler as MiddlewareHandler);
  app.use("/_sprout/hydrate.js", islandBundler as MiddlewareHandler);
  app.use("/_sprout/runtime/mount.js", islandBundler as MiddlewareHandler);

  // Create HMR handler
  const { handler: wsHandler, broadcast } = createHmrHandler();

  // Register HMR WebSocket handler
  // SAFETY: upgradeWebSocket returns a handler with ws-specific branding that
  // Hono's type system doesn't surface on app.get's expected Handler type.
  // The cast is safe at runtime because Hono resolves the handler correctly.
  // deno-lint-ignore no-explicit-any
  app.get("/_sprout/hmr", wsHandler as any);

  // Register HMR injector BEFORE init so it runs as global middleware
  // (registered after route handlers, it would run after them and miss the response)
  app.use(hmrInjector());

  // Initialize app (registers routes)
  await app.init();

  // Start file watcher
  const watcher = watchFiles([routesDir, islandsDir, staticDir], (event) => {
    // Invalidate cache for island changes and reload events.
    // CSS changes do not require cache invalidation.
    if (event.type !== "css-update") {
      invalidate(event.path);
    }

    // Broadcast to all connected WebSocket clients
    broadcast(event);
  });

  // Store watcher reference in the WeakMap so it can be closed if needed.
  watcherMap.set(app, watcher);

  return app;
}
