// server.ts - Static file serving
import { serveStatic } from "@hono/hono/deno";
import type { MiddlewareHandler } from "@hono/hono";
import { extname, join } from "@std/path";

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
  return async (c) => {
    const path = c.req.path;
    // Strip the /_sprout prefix to get the relative file path
    const relPath = path.replace(/^\/_sprout/, "") || "/";

    // Reject path traversal: any .. segment that could escape distDir
    if (relPath.includes("..")) {
      return c.text("404 Not Found", 404);
    }

    const joinedPath = join(distDir, relPath);

    // Get the realpath of the directory to resolve any symlinks, then verify
    // the file's realpath stays within it. This catches traversal that
    // join/resolve cannot (e.g. islands/../../client.js → resolves to distDir's sibling).
    let distDirReal: string;
    let absPath: string;
    try {
      distDirReal = await Deno.realPath(distDir);
      absPath = await Deno.realPath(joinedPath);
    } catch {
      return c.text("404 Not Found", 404);
    }

    const separator = Deno.build.os === "windows" ? "\\" : "/";
    if (!absPath.startsWith(distDirReal + separator)) {
      return c.text("404 Not Found", 404);
    }

    let fileInfo: Deno.FileInfo;
    try {
      fileInfo = await Deno.stat(absPath);
    } catch {
      return c.text("404 Not Found", 404);
    }

    if (fileInfo.isDirectory) {
      return c.text("404 Not Found", 404);
    }

    const isIslandBundle = relPath.startsWith("/islands/");
    const cacheControl = isIslandBundle
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    const ext = extname(relPath).toLowerCase();
    const contentType = ext === ".js" || ext === ".mjs"
      ? "text/javascript; charset=utf-8"
      : ext === ".css"
      ? "text/css; charset=utf-8"
      : ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".json"
      ? "application/json; charset=utf-8"
      : ext === ".txt"
      ? "text/plain; charset=utf-8"
      : ext === ".wasm"
      ? "application/wasm"
      : "application/octet-stream";

    const headers = new Headers();
    headers.set("Cache-Control", cacheControl);
    headers.set("Content-Type", contentType);

    const body = await Deno.readFile(absPath);
    return new Response(body, { status: 200, headers });
  };
}
