// Slash-normalization and root-containment helpers used across Sprout.
//
// `slash` is a deterministic, platform-independent path normalizer:
// backslashes become forward slashes, runs of `/` collapse to one, a
// trailing `/` is stripped (except for the root itself), and a leading
// `./` is stripped. This is the canonical form every other Sprout
// package uses when comparing or logging paths.
//
// `isInsideRoot` is a strict containment check for absolute paths. It
// refuses NUL bytes in either argument and uses relative-path
// containment (`root` itself OR a path strictly inside `root`) rather
// than string-prefix matching, so sibling directories that share a
// common prefix are correctly rejected.

/**
 * Normalize a path string to slash form.
 *
 * - Backslashes become forward slashes.
 * - Runs of two or more `/` collapse to a single `/`.
 * - A trailing `/` is stripped, except when the entire result is `/`
 *   (the filesystem root is preserved).
 * - A leading `./` is stripped.
 *
 * The function never throws and never reads the filesystem; it is a
 * pure string transformation. Non-string input returns `""` and
 * input containing a NUL byte returns `""` (NUL bytes are a
 * security red flag: a downstream `isInsideRoot` check would also
 * reject them, so the safe canonical form is the empty string).
 *
 * @example
 * ```ts
 * slash("a\\b/c");   // "a/b/c"
 * slash("a//b");     // "a/b"
 * slash("/a/");      // "/a"
 * slash("/");        // "/"
 * slash("./a");      // "a"
 * ```
 */
export function slash(input: string): string {
  if (typeof input !== "string") {
    return "";
  }
  if (input.includes("\0")) {
    return "";
  }
  let s = input.replace(/\\/g, "/");
  if (s.startsWith("./")) {
    s = s.slice(2);
  }
  s = s.replace(/\/{2,}/g, "/");
  if (s.length > 1 && s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  return s;
}

/**
 * Test whether a slash-normalized absolute `candidate` path is the
 * `root` itself or is strictly contained inside it.
 *
 * Containment is computed with relative-path semantics:
 *
 * - `isInsideRoot("/proj", "/proj")` is `true`;
 * - `isInsideRoot("/proj/sub", "/proj")` is `true`;
 * - `isInsideRoot("/proj-evil", "/proj")` is `false` (sibling-prefix
 *   escape);
 * - `isInsideRoot("/proj2", "/proj")` is `false`.
 *
 * Either argument containing a NUL byte returns `false`. Either
 * argument not being an absolute path (`/`-prefixed after
 * normalization) returns `false`. An empty `root` returns `false`.
 *
 * @example
 * ```ts
 * isInsideRoot("/proj/sub", "/proj");     // true
 * isInsideRoot("/proj-evil", "/proj");    // false
 * isInsideRoot("/proj", "/proj");         // true
 * ```
 */
export function isInsideRoot(candidate: string, root: string): boolean {
  if (typeof candidate !== "string" || typeof root !== "string") {
    return false;
  }
  if (root.length === 0) {
    return false;
  }
  if (candidate.includes("\0") || root.includes("\0")) {
    return false;
  }
  const c = slash(candidate);
  const r = slash(root);
  if (!c.startsWith("/") || !r.startsWith("/")) {
    return false;
  }
  if (c === r) {
    return true;
  }
  return c.startsWith(r + "/");
}
