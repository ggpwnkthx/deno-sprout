// Path-to-pattern and pattern-to-public-path mapping for `@sprout/compiler`.
//
// Glob matching is delegated to `@std/path`'s `globToRegExp` with the
// default options (`extended: true`, `globstar: true`). This matches
// bash globstar semantics: `**` matches zero or more path segments, so
// `**/*.{ts,tsx}` matches `index.tsx` and `blog/index.tsx` alike.
//
// Two projection functions are exported:
//
//   - `routeFileToPattern(relativePath)` maps a route file's
//     extension-stripped slash-normalized relative path to a Hono
//     route pattern. Returns `null` for private helpers (leading
//     underscore segments) so the caller can skip them.
//
//   - `islandFileToPublicPath(relativePath)` maps an island file's
//     extension-stripped relative path to its canonical
//     `/@sprout/island/<id>.js` public URL. Throws
//     `MANIFEST_INVALID_PUBLIC_PATH` on dot-segments or NUL bytes.
import { globToRegExp } from "@std/path";
import { CompilerError } from "../errors.ts";

const ISLAND_PUBLIC_PREFIX = "/@sprout/island/";
const ISLAND_PUBLIC_SUFFIX = ".js";

/**
 * Reserved framework URL prefix. The validator uses this to keep
 * public files from shadowing framework URLs and to keep island
 * public paths in their own namespace.
 */
export const RESERVED_ASSET_PREFIX = "/@sprout/";

/** `true` for any public path that lives under the reserved framework URL namespace. */
export function isReservedAssetPath(publicPath: string): boolean {
  return publicPath.startsWith(RESERVED_ASSET_PREFIX);
}

export { globToRegExp };

// ---------------------------------------------------------------------------
// include / exclude helper
// ---------------------------------------------------------------------------

/** `true` if `relativePath` matches any of the `patterns`. */
function matchesAny(relativePath: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (globToRegExp(p).test(relativePath)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Route file → pattern
// ---------------------------------------------------------------------------

/**
 * Map a route file's relative path (slash-normalized, extension
 * stripped) to a Hono route pattern.
 *
 * Rules:
 *
 *   - `index`                 → `"/"`
 *   - `about`                 → `"/about"`
 *   - `blog/index`            → `"/blog"`
 *   - `blog/[slug]`           → `"/blog/:slug"`
 *   - `files/[...path]`       → `"/files/:path{.+}"`
 *   - `(group)/about`         → `"/about"` (route groups are dropped)
 *   - `_layout` / `_helpers`  → `null` (private helpers are skipped)
 *
 * Returns `null` to signal "skip this file". The caller (`discoverRoutes`)
 * drops `null` results without raising a duplicate-pattern error.
 */
export function routeFileToPattern(relativePath: string): string | null {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return null;
  }
  if (relativePath.includes("\0")) {
    return null;
  }
  // Split on `/`; reject any segment that is `.` or `..`.
  const segments = relativePath.split("/");
  if (segments.some((s) => s === "." || s === "..")) {
    return null;
  }
  // Drop private-helper segments. If anything remains after filtering,
  // the caller will treat this as `null` (skip).
  if (segments.some((s) => s.startsWith("_"))) {
    return null;
  }
  // Drop route-group segments.
  const cleaned = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  // Drop `index` segments: they represent "the directory itself".
  const urlSegments: string[] = [];
  for (const seg of cleaned) {
    if (seg === "index") {
      continue;
    }
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      const name = seg.slice(4, -1);
      if (name.length === 0) {
        return null;
      }
      urlSegments.push(":" + name + "{.+}");
    } else if (seg.startsWith("[") && seg.endsWith("]")) {
      const name = seg.slice(1, -1);
      if (name.length === 0) {
        return null;
      }
      urlSegments.push(":" + name);
    } else {
      urlSegments.push(seg);
    }
  }
  if (urlSegments.length === 0) {
    return "/";
  }
  return "/" + urlSegments.join("/");
}

// ---------------------------------------------------------------------------
// Island file → public path
// ---------------------------------------------------------------------------

/**
 * Map an island file's relative path (slash-normalized, extension
 * stripped) to its canonical `/@sprout/island/<id>.js` public URL.
 *
 * Throws `CompilerError("MANIFEST_INVALID_PUBLIC_PATH", ...)` on
 * empty input, NUL bytes, dot-segments, or any segment that would
 * produce an invalid URL.
 */
export function islandFileToPublicPath(relativePath: string): string {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new CompilerError(
      "MANIFEST_INVALID_PUBLIC_PATH",
      "island relative path is empty",
      { path: relativePath },
    );
  }
  if (relativePath.includes("\0")) {
    throw new CompilerError(
      "MANIFEST_INVALID_PUBLIC_PATH",
      "island relative path contains a NUL byte",
      { path: relativePath },
    );
  }
  const segments = relativePath.split("/");
  for (const s of segments) {
    if (s === "." || s === "..") {
      throw new CompilerError(
        "MANIFEST_INVALID_PUBLIC_PATH",
        "island relative path contains a dot-segment",
        { path: relativePath, segment: s },
      );
    }
    if (s.length === 0) {
      throw new CompilerError(
        "MANIFEST_INVALID_PUBLIC_PATH",
        "island relative path contains an empty segment",
        { path: relativePath },
      );
    }
  }
  return ISLAND_PUBLIC_PREFIX + relativePath + ISLAND_PUBLIC_SUFFIX;
}

// ---------------------------------------------------------------------------
// include / exclude helper
// ---------------------------------------------------------------------------

/** Apply the include / exclude globs from a discovery config to a relative path. */
export function matchesDiscoveryGlobs(
  relativePath: string,
  include: readonly string[],
  exclude: readonly string[],
): boolean {
  if (!matchesAny(relativePath, include)) {
    return false;
  }
  if (matchesAny(relativePath, exclude)) {
    return false;
  }
  return true;
}
