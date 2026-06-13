// Public-file serving helpers for `@sprout/core`.
//
// Two responsibilities live here:
//
//   - `resolvePublicFile` maps a request URL path to an absolute
//     filesystem path under the configured `publicDir`, with strict
//     traversal protection. The reserved framework namespace
//     (`/@sprout/...`) is rejected so a public file can never shadow
//     a framework asset route.
//
//   - `serveStaticFile` streams a file from disk into a `Response`
//     without loading the entire file into memory. The file is
//     opened with `Deno.open`, the readable side is wrapped in a
//     `ReadableStream`, and the response body is that stream.
//
// The content-type map is intentionally small. M3 covers the common
// cases; the M7 production serve may swap this for `jsr:@std/media-types`.
import { isInsideRoot, slash } from "@sprout/utils";
import { CoreError } from "./errors.ts";

/** Common content-type lookup. Falls back to `application/octet-stream`. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** Reserved framework URL namespace. Public files must not match it. */
const RESERVED_PUBLIC_PREFIX = "/@sprout/";

/**
 * Map a file extension (including the leading `.`) to a content
 * type. Returns `application/octet-stream` for unknown extensions.
 */
function contentTypeForExtension(ext: string): string {
  const lower = ext.toLowerCase();
  return CONTENT_TYPES[lower] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * Return the lowercase extension (including the leading `.`) of a
 * file path, or `""` for paths that have none. `foo` → `""`,
 * `foo.bar` → `.bar`, `foo.bar.baz` → `.baz`.
 */
function extensionOf(filePath: string): string {
  const slashIdx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const basename = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) {
    return "";
  }
  return basename.slice(dotIdx);
}

/**
 * Resolve a request URL path to a file inside `publicDir`.
 *
 * Returns `null` when:
 *   - the URL path is empty or `"/"`;
 *   - the URL path contains a NUL byte or a `..` segment;
 *   - the URL path starts with `/@sprout/` (the framework reserves
 *     this namespace; public files are not allowed to shadow it);
 *   - the resulting path does not exist on disk.
 *
 * The returned path is the slash-normalized absolute path on disk,
 * already proven to be inside `publicDir` via `isInsideRoot`.
 */
export async function resolvePublicFile(
  publicDir: string,
  urlPath: string,
): Promise<string | null> {
  if (typeof urlPath !== "string" || urlPath.length === 0) {
    return null;
  }
  if (typeof publicDir !== "string" || publicDir.length === 0) {
    return null;
  }
  if (urlPath.includes("\0")) {
    return null;
  }
  if (urlPath.startsWith(RESERVED_PUBLIC_PREFIX)) {
    // Framework namespace. Public files must not match it. The caller
    // is expected to fall through to the route dispatcher (or, in
    // M4, the framework asset routes).
    return null;
  }
  // Strip a single leading `/`. The URL is `pathname`-shaped: it
  // never contains the host or query string.
  const rel = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  if (rel.length === 0) {
    return null;
  }
  // Reject any `..` segment after slash normalization. We do not
  // re-resolve symlinks here; the `isInsideRoot` check below catches
  // any path that escapes the public dir, but symlink targets are
  // only resolved at stat time.
  const normalized = slash(rel);
  for (const seg of normalized.split("/")) {
    if (seg === ".." || seg === ".") {
      return null;
    }
  }
  // Use a manual join so we do not depend on `@std/path` here. The
  // public dir is slash-normalized.
  const rootSlash = publicDir.endsWith("/") ? publicDir : publicDir + "/";
  const candidate = slash(rootSlash + normalized);
  if (!isInsideRoot(candidate, publicDir)) {
    return null;
  }
  try {
    const stat = await Deno.stat(candidate);
    if (!stat.isFile) {
      return null;
    }
  } catch (_cause) {
    return null;
  }
  return candidate;
}

/**
 * Serve a file from disk with a streamed body.
 *
 * The function:
 *   - rejects empty `filePath` with `STATIC_FILE_NOT_FOUND`;
 *   - rejects paths that escape `root` with
 *     `STATIC_FILE_OUTSIDE_ROOT` (the caller converts to a 404 to
 *     avoid leaking the requested path);
 *   - stats the file; missing files or non-regular files throw
 *     `STATIC_FILE_NOT_FOUND`;
 *   - opens the file and pipes the readable side into a
 *     `ReadableStream` so the body is never held in memory.
 *
 * `init.headers` may set additional response headers (for example
 * `content-type` overrides from a test). The `content-type` and
 * `cache-control` headers are set by this function and may be
 * overridden by the caller via `init.headers`.
 *
 * `cacheControl` overrides the default `cache-control` header
 * value. The default is `"public, max-age=3600"`, which matches
 * the M3 spec for development. The M7 production serve passes
 * `"public, max-age=3600"` as well (public files are not
 * content-hashed), so the value is the same in dev and prod;
 * the explicit option exists so a future change to dev's
 * `no-store` policy does not have to be made through the dev
 * server's static-file call site.
 */
export async function serveStaticFile(
  filePath: string,
  root: string,
  init?: ResponseInit,
  cacheControl?: string,
): Promise<Response> {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new CoreError(
      "STATIC_FILE_NOT_FOUND",
      "static file path is empty",
      { path: filePath },
    );
  }
  if (!isInsideRoot(slash(filePath), slash(root))) {
    throw new CoreError(
      "STATIC_FILE_OUTSIDE_ROOT",
      "static file path is outside the public directory",
      { path: filePath, root },
    );
  }
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(filePath);
  } catch (_cause) {
    throw new CoreError(
      "STATIC_FILE_NOT_FOUND",
      "static file does not exist",
      { path: filePath },
    );
  }
  if (!stat.isFile) {
    throw new CoreError(
      "STATIC_FILE_NOT_FOUND",
      "static file path is not a regular file",
      { path: filePath },
    );
  }
  const file = await Deno.open(filePath, { read: true });
  const ext = extensionOf(filePath);
  const contentType = contentTypeForExtension(ext);
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", contentType);
  }
  if (!headers.has("content-length")) {
    headers.set("content-length", String(stat.size));
  }
  if (!headers.has("cache-control")) {
    // M3 default: short max-age. The M7 production serve passes
    // the same value through `cacheControl`; framework assets use
    // their own ETag / immutable contract (see
    // `server/prod_assets.ts`) and never reach this path.
    headers.set("cache-control", cacheControl ?? "public, max-age=3600");
  }
  // Wrap the file's `ReadableStream` so we can release the handle
  // when the consumer cancels the body. This keeps the file
  // descriptor from leaking when a client disconnects mid-stream.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const reader = file.readable.getReader();
      const pump = async (): Promise<void> => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            if (value !== undefined) {
              controller.enqueue(value);
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          try {
            await file.close();
          } catch (_cause) {
            // Already closed; ignore.
          }
        }
      };
      pump();
    },
    cancel() {
      // Client cancelled; the start() pump's try/finally will close
      // the file, but the call is also defensive.
      try {
        file.close();
      } catch (_cause) {
        // Already closed; ignore.
      }
    },
  });
  return new Response(body, {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers,
  });
}
