// Shared content-type lookup for file extensions.
//
// This module consolidates the extension → MIME-type maps that were
// previously duplicated in `@sprout/core` (public file serving) and
// `@sprout/compiler` (content-hashed production assets).
//
// M7 may replace this with `jsr:@std/media-types`; until then the map
// stays small and focused on the extensions Sprout actually serves.
/** Map of file extension (including `.`) to MIME content type. */
export const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** MIME type returned for unknown file extensions. */
export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Return the content type for `filename`.
 *
 * Looks up the lowercase extension (including the leading `.`) in
 * `EXTENSION_CONTENT_TYPES`. Returns `DEFAULT_CONTENT_TYPE` for
 * unknown extensions or filenames without an extension.
 */
export function contentTypeForFilename(filename: string): string {
  const slashIdx = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  const basename = slashIdx >= 0 ? filename.slice(slashIdx + 1) : filename;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) {
    return DEFAULT_CONTENT_TYPE;
  }
  const ext = basename.slice(dotIdx).toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? DEFAULT_CONTENT_TYPE;
}

/**
 * Return the lowercase extension (including the leading `.`) of a
 * file path, or `""` for paths that have none. `foo` → `""`,
 * `foo.bar` → `.bar`, `foo.bar.baz` → `.baz`.
 */
export function extensionOf(filePath: string): string {
  const slashIdx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const basename = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) {
    return "";
  }
  return basename.slice(dotIdx);
}
