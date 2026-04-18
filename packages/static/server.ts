// server.ts - Static file serving
import { serveStatic } from "@hono/hono/deno";
import type { MiddlewareHandler } from "@hono/hono";

export interface StaticFilesOptions {
  /** Filesystem directory to serve files from. Default: "./static" */
  root?: string;
  /**
   * URL path prefix to mount under. Default: "/static"
   * A request to /static/logo.svg serves `{root}/logo.svg`.
   */
  prefix?: string;
}

/**
 * Serve files from `options.root` under `options.prefix`.
 * Uses @hono/hono's built-in `serveStatic` Deno adapter.
 * Returns 404 via next() if the file is not found.
 */
export function staticFiles(options?: StaticFilesOptions): MiddlewareHandler {
  const opts = options ?? {};
  const root = opts.root ?? "./static";
  const prefix = opts.prefix ?? "/static";
  return serveStatic({
    root,
    rewriteRequestPath: (path) =>
      path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path,
  });
}

export interface SproutAssetsOptions {
  /** Directory containing built assets (_dist). Default: "./_dist" */
  distDir?: string;
}

/**
 * Serve built island bundles and the hydration runtime from `distDir`
 * under `/_sprout/`.
 * A request to /_sprout/hydrate.js serves `{distDir}/hydrate.js`.
 * A request to /_sprout/islands/Counter.js serves `{distDir}/islands/Counter.js`.
 */
export function sproutAssets(options?: SproutAssetsOptions): MiddlewareHandler {
  const distDir = (options ?? {}).distDir ?? "./_dist";
  const staticHandler = serveStatic({
    root: distDir,
    rewriteRequestPath: (path) => path.replace(/^\/_sprout/, "") || "/",
  });
  return async (c, next) => {
    await staticHandler(c, next);
    const url = new URL(c.req.url);
    const isIslandBundle = url.pathname.startsWith("/islands/");
    if (isIslandBundle) {
      c.res.headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
    } else {
      c.res.headers.set("Cache-Control", "no-cache");
    }
  };
}
