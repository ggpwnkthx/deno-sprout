// matcher.ts - Route matching utilities
/**
 * The result of a successful route match, containing the matched pattern
 * string and any extracted parameters.
 */
export interface RouteMatch {
  /** The original pattern string that matched. */
  pattern: string;
  /** Extracted route parameters keyed by name. */
  params: Record<string, string>;
}

/** A route pattern accepted by `matchRoute`. Either a literal string or a compiled `URLPattern`. */
export type RoutePattern = string | URLPattern;

/**
 * Tests a pathname against a route pattern.
 *
 * When `pattern` is a string, only exact equality is checked.
 * When `pattern` is a `URLPattern`, groups are extracted from `pathname.groups`.
 *
 * @param pattern - A literal path string or a `URLPattern` instance.
 * @param pathname - The URL pathname to match.
 * @returns A `RouteMatch` on success, or `null` if no match.
 * @example
 * ```ts
 * matchRoute("/blog/:slug", "/blog/my-post")  // { pattern: "/blog/:slug", params: { slug: "my-post" } }
 * matchRoute("/blog/:slug", "/blog/")         // null
 * ```
 */
export function matchRoute(
  pattern: RoutePattern,
  pathname: string,
): RouteMatch | null {
  if (typeof pattern === "string") {
    // Simple pattern matching
    if (pattern === pathname) return { pattern, params: {} };
    return null;
  }
  const result = pattern.exec(pathname);
  if (result) {
    const groups: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.pathname.groups)) {
      if (value !== undefined) {
        groups[key] = value;
      }
    }
    // In Deno's URLPattern, pathname is a string pattern
    const patternStr = pattern.pathname;
    return { pattern: patternStr, params: groups };
  }
  return null;
}

/**
 * Interpolates a parameterized path pattern with the given parameter values.
 *
 * Unrecognized keys are replaced with an empty string. If `params` is omitted,
 * the pattern is returned unchanged.
 *
 * @param pattern - A parameterized path string containing `:name` tokens.
 * @param params - A record of parameter values keyed by name.
 * @returns The interpolated path string.
 * @example
 * ```ts
 * generatePath("/blog/:slug", { slug: "my-post" })  // "/blog/my-post"
 * generatePath("/users/:id/posts", { id: "42" })    // "/users/42/posts"
 * generatePath("/blog/:slug")                        // "/blog/"
 * ```
 */
export function generatePath(
  pattern: string,
  params?: Record<string, string>,
): string {
  if (!params) return pattern;
  return pattern.replace(/:(\w+)/g, (_, key) => params[key] ?? "");
}
