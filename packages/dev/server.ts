// server.ts - Development server with HMR
import { App } from "@ggpwnkthx/sprout-core/app";
import { createHmrHandler, watchFiles } from "./hmr.ts";
import { devIslandBundler } from "./lib/bundler.ts";
import { dirname, join } from "@std/path";
import type { MiddlewareHandler } from "@hono/hono";

// Derive the monorepo root from this file's location.
// server.ts lives at packages/dev/server.ts — three dirname levels up reaches the
// monorepo root (../../.. from packages/dev/server.ts → monorepo root).
// import.meta.url is a file:// URL on Deno; strip the prefix so dirname operates on a
// native filesystem path.
const MONOREPO_ROOT = dirname(
  dirname(dirname(import.meta.url.replace(/^file:\/\//, ""))),
);

export interface DevServerOptions {
  /** Project root. Default: Deno.cwd() */
  root?: string;
  /** HTTP port. Default: 8000 */
  port?: number;
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
 * Create a Hono app configured for development:
 *   - All Phase 1 routing and JSX rendering
 *   - On-the-fly island bundling at /_sprout/islands/*.js
 *   - HMR WebSocket at /_sprout/hmr
 *   - HMR script injected into every HTML response
 *   - File watcher that broadcasts changes to connected browsers
 *
 * Returns the Hono app (not a running server - caller calls Deno.serve).
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
  app.get("/_sprout/hmr", wsHandler as MiddlewareHandler);

  // Register HMR injector BEFORE init so it runs as global middleware
  // (registered after route handlers, it would run after them and miss the response)
  app.use(hmrInjector());

  // Initialize app (registers routes)
  await app.init();

  // Start file watcher
  const watcher = watchFiles([routesDir, islandsDir, staticDir], (event) => {
    // Invalidate cache for island changes
    if (event.type === "island-update" || event.type === "reload") {
      // For reload events, we need to invalidate all island caches
      // since any file could affect the route
      invalidate(event.path);
    } else if (event.type === "css-update") {
      // CSS changes don't require cache invalidation
    }

    // Broadcast to all connected WebSocket clients
    broadcast(event);
  });

  // Store watcher reference so it can be closed if needed
  (app as unknown as { _hmrWatcher?: { close: () => void } })._hmrWatcher =
    watcher;

  return app;
}
