// server.ts - Static file serving
import { serveStatic } from "@hono/hono/deno";
import type { MiddlewareHandler } from "@hono/hono";
import { extname, join } from "@std/path";
import { isContainedPath } from "@ggpwnkthx/sprout-core/path";

/**
 * Options for {@link staticFiles}.
 *
 * @example
 * ```ts
 * import { staticFiles } from "@ggpwnkthx/sprout-static";
 *
 * // Mount ./public under /static (default)
 * app.use(staticFiles());
 *
 * // Mount a custom directory under a prefix
 * app.use(staticFiles({ root: "./public", prefix: "/assets" }));
 * ```
 */
export interface StaticFilesOptions {
  /** Filesystem directory to serve files from. Default: `"./static"` */
  root?: string;
  /**
   * URL path prefix to mount under. Default: `"/static"`
   *
   * A request to `/static/logo.svg` serves `{root}/logo.svg`.
   */
  prefix?: string;
}

/**
 * Serve files from a filesystem directory under a URL prefix.
 *
 * Wraps `@hono/hono/deno`'s `serveStatic` Deno adapter.
 *
 * **Returns 200** with the file body on success.
 * **Returns 404** (via `next()`) if the file is not found.
 * Path traversal attempts are handled by the underlying Hono adapter and return `404`.
 * Content-Type is set by the Hono adapter based on file extension.
 *
 * Requests for a path that does not start with `prefix` are passed
 * through to the next middleware.
 *
 * Files are streamed via `ReadableStream` without buffering the full
 * payload in memory.
 *
 * @param options - Optional configuration. See {@link StaticFilesOptions}.
 * @returns A Hono middleware handler.
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

/**
 * Options for {@link sproutAssets}.
 *
 * @example
 * ```ts
 * import { sproutAssets } from "@ggpwnkthx/sprout-static";
 *
 * app.use(sproutAssets({ distDir: "./_dist" }));
 * ```
 */
export interface SproutAssetsOptions {
  /**
   * Directory containing built assets (`_dist`). Default: `"./_dist"`
   *
   * Expected layout:
   * ```
   * _dist/
   *   hydrate.js
   *   islands/
   *     Counter.{hash}.js
   * ```
   */
  distDir?: string;
}

/**
 * Serve built island bundles and the hydration runtime from `distDir`
 * under `/_sprout/`.
 *
 * - A request to `/_sprout/hydrate.js` serves `{distDir}/hydrate.js`
 *   with `Cache-Control: no-cache`.
 * - A request to `/_sprout/islands/Counter.js` serves
 *   `{distDir}/islands/Counter.js` with
 *   `Cache-Control: public, max-age=31536000, immutable` (long-lived CDN
 *   cache for content-hashed island bundles).
 *
 * Requests for paths outside `/_sprout/*` are passed through to the next
 * middleware via `next()`.
 *
 * Path traversal attempts (`..`) are rejected with `404`,
 * returning a plain-text `"404 Not Found"` body. A request that resolves
 * to a directory also returns `404`.
 *
 * Symlink traversal is guarded by resolving both `distDir` and the joined
 * path to their real paths via `Deno.realPath` and checking containment
 * with `isContainedPath`.
 *
 * Returns `200` with the file as a `ReadableStream` on success.
 * Content-Type is derived from the file extension:
 * | Extension | Content-Type                     |
 * | --------- | -------------------------------- |
 * | `.js`/`.mjs` | `text/javascript; charset=utf-8` |
 * | `.css`   | `text/css; charset=utf-8`        |
 * | `.html`  | `text/html; charset=utf-8`       |
 * | `.json`  | `application/json; charset=utf-8` |
 * | `.txt`   | `text/plain; charset=utf-8`      |
 * | `.wasm`  | `application/wasm`               |
 * | (other)  | `application/octet-stream`        |
 *
 * @param options - Optional configuration. See {@link SproutAssetsOptions}.
 * @returns A Hono middleware handler.
 */
export function sproutAssets(options?: SproutAssetsOptions): MiddlewareHandler {
  const distDir = (options ?? {}).distDir ?? "./_dist";
  return async (c, next) => {
    const path = c.req.path;
    // Only handle /_sprout/* paths; pass through to next middleware otherwise
    if (!path.startsWith("/_sprout")) {
      return next();
    }
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

    const sep = Deno.build.os === "windows" ? "\\" : "/";
    if (!(await isContainedPath(absPath, distDirReal, sep))) {
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

    // Open the file as a resource; readable stream is automatically
    // closed when the response is consumed. Avoids buffering the
    // full file in heap memory for large assets.
    let file: Deno.FsFile;
    try {
      file = await Deno.open(absPath, { read: true });
    } catch {
      return c.text("404 Not Found", 404);
    }

    const headers = new Headers();
    headers.set("Cache-Control", cacheControl);
    headers.set("Content-Type", contentType);

    // Transfer the readable stream; Deno closes the handle when the
    // stream is exhausted or aborted.
    return new Response(file.readable, { status: 200, headers });
  };
}
