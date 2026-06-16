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
import { contentTypeForFilename, isInsideRoot, NOSNIFF, slash } from "@sprout/utils";
import { CoreError } from "./errors.ts";

/** Reserved framework URL namespace. Public files must not match it. */
const RESERVED_PUBLIC_PREFIX = "/@sprout/";

/**
 * Resolve a request URL path to a file inside `publicDir`.
 *
 * Returns `null` when:
 *   - the URL path is empty or `"/"`;
 *   - the URL path contains a NUL byte or a `..` segment
 *     (percent-encoded sequences like `%2e%2e` are decoded
 *     before the check; invalid percent encoding is rejected);
 *   - the URL path starts with `/@sprout/` (the framework reserves
 *     this namespace; public files are not allowed to shadow it);
 *   - the resulting path does not exist on disk;
 *   - the candidate is a symbolic link (resolved via `Deno.lstat`
 *     before `Deno.stat` to prevent symlink-escape path traversal).
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
  // Decode percent-encoded sequences so a literal `%2e%2e` becomes
  // `..` and is caught by the segment check below. Invalid percent
  // encoding (e.g. `%zz`) is rejected outright.
  let decoded: string;
  try {
    decoded = decodeURI(rel);
  } catch (_cause) {
    return null;
  }
  // Reject any `..` segment after slash normalization. We do not
  // re-resolve symlinks here; the `isInsideRoot` check below catches
  // any path that escapes the public dir, but symlink targets are
  // only resolved at stat time.
  const normalized = slash(decoded);
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
  // Use Deno.lstat (not Deno.stat) to detect symlinks before they
  // are followed. Deno.lstat reports the link itself; Deno.stat
  // would follow it and defeat the isInsideRoot guard for
  // symlink-escape attacks (e.g. publicDir/foo -> /etc/passwd).
  // Reject all symlinks: publicDir contents are exactly the served
  // contents, with no indirection.
  try {
    const lstat = await Deno.lstat(candidate);
    if (lstat.isSymlink) {
      return null;
    }
    if (!lstat.isFile) {
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
  const contentType = contentTypeForFilename(filePath);
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
  headers.set("x-content-type-options", NOSNIFF);
  // Wrap the file's `ReadableStream` so we can release the handle
  // when the consumer cancels the body. This keeps the file
  // descriptor from leaking when a client disconnects mid-stream.
  //
  // Cancellation contract: when the stream is cancelled (e.g., the
  // client disconnects), the reader is abandoned and the next
  // iteration of the pump's `while` loop sees the closed reader
  // and exits through the `finally` block which closes the file.
  // The pump's `finally` block is always reached, so the file
  // descriptor is never leaked regardless of how the stream ends.
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
  });
  return new Response(body, {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers,
  });
}
