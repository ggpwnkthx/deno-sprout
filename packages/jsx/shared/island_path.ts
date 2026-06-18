// Shared island public-path validation for `@sprout/jsx` and `@sprout/compiler`.
//
// The same constraints (prefix `/@sprout/island/`, suffix `.js`, no NUL
// bytes, no `.` or `..` segments, non-empty id) are encoded at three
// sites. This module holds the canonical implementation so the logic
// stays in sync.
export const ISLAND_PATH_PREFIX = "/@sprout/island/";
export const ISLAND_PATH_SUFFIX = ".js";
// Rejects: empty id, id starting with `.`, any segment equal to `.` or `..`.
export const ISLAND_PUBLIC_PATTERN =
  /^\/@sprout\/island\/(?!\.)(?!.*\/\.)(?!.*\/\.\.)[A-Za-z0-9_][A-Za-z0-9_\-\/]*\.js$/;

export type IslandPathValidationReason =
  | "not_string"
  | "nul_byte"
  | "missing_prefix"
  | "missing_extension"
  | "bad_shape"
  | "empty_id"
  | "dot_segment";

export type IslandPathValidation =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: IslandPathValidationReason };

/**
 * Validate a public island src path and extract the island id.
 *
 * A valid path:
 *   - is a string;
 *   - contains no NUL bytes;
 *   - starts with `/@sprout/island/`;
 *   - ends with `.js`;
 *   - matches the `ISLAND_PUBLIC_PATTERN` regex (non-empty id, no dot segments);
 *   - has a non-empty id between the prefix and suffix;
 *   - contains no `.` or `..` path segments in the id.
 *
 * Returns `{ ok: true, id }` for valid paths or `{ ok: false, reason }`
 * for invalid ones.
 */
export function validateIslandPublicPath(src: string): IslandPathValidation {
  if (typeof src !== "string") {
    return { ok: false, reason: "not_string" };
  }
  if (src.includes("\0")) {
    return { ok: false, reason: "nul_byte" };
  }
  if (!src.startsWith(ISLAND_PATH_PREFIX)) {
    return { ok: false, reason: "missing_prefix" };
  }
  if (!src.endsWith(ISLAND_PATH_SUFFIX)) {
    return { ok: false, reason: "missing_extension" };
  }
  if (!ISLAND_PUBLIC_PATTERN.test(src)) {
    // The regex covers empty_id and dot_segment cases, so we return
    // bad_shape here only when neither of those more-specific reasons apply.
    const tail = src.slice(ISLAND_PATH_PREFIX.length, -ISLAND_PATH_SUFFIX.length);
    if (tail.length === 0) {
      return { ok: false, reason: "empty_id" };
    }
    for (const segment of tail.split("/")) {
      if (segment === "." || segment === "..") {
        return { ok: false, reason: "dot_segment" };
      }
    }
    return { ok: false, reason: "bad_shape" };
  }
  const tail = src.slice(ISLAND_PATH_PREFIX.length, -ISLAND_PATH_SUFFIX.length);
  return { ok: true, id: tail };
}
