// lib/params.ts - Parameter extraction from Hono route matches
/**
 * Extracts typed route parameters from the raw key-value map returned by
 * Hono's `c.req.param()`.
 *
 * Three patterns are supported:
 * - **Named params** — pattern contains `:name` segments, matched against
 *   keys in `honoParams`.
 * - **Bare wildcard** — pattern contains `*` (but not `[...name]`). The value
 *   is returned as `rest`.
 * - **Catch-all** — pattern contains `[...name]`. The value from Hono's `*`
 *   key is returned under the declared parameter name.
 *
 * Static patterns (no dynamic segments) return an empty object.
 *
 * @param pattern - URL pattern string from the route file path.
 * @param honoParams - Raw parameter map from Hono's request context.
 * @returns A record of extracted parameter names to values.
 * @example
 * ```ts
 * extractParams("/blog/:slug", { slug: "my-post" })        // { slug: "my-post" }
 * extractParams("/files/*", { "*": "a/b.txt" })           // { rest: "a/b.txt" }
 * extractParams("/docs/[...path]", { "*": "a/b.md" })     // { path: "a/b.md" }
 * extractParams("/static/page", {})                       // {}
 * ```
 */
export function extractParams(
  pattern: string,
  honoParams: Record<string, string>,
): Record<string, string> {
  // Static routes: no parameters to extract
  if (
    !pattern.includes(":") &&
    !pattern.includes("[...") &&
    !pattern.includes("*")
  ) {
    return {};
  }

  // Bare wildcard * style parameters (Hono wildcard, e.g. /blog/*)
  if (pattern.includes("*") && !pattern.includes("[...")) {
    if (honoParams["*"] !== undefined) {
      return { rest: honoParams["*"] };
    }
    return {};
  }

  // Named :param style parameters
  const paramNames = pattern.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  if (paramNames) {
    const result: Record<string, string> = {};
    for (const name of paramNames) {
      const key = name.slice(1); // Remove leading ':'
      if (honoParams[key] !== undefined) {
        result[key] = honoParams[key];
      }
    }
    return result;
  }

  // Catch-all [...name] style parameters
  const catchAllMatch = pattern.match(/\[(\.\.\.[a-zA-Z_][a-zA-Z0-9_]*)\]/);
  if (catchAllMatch && honoParams["*"] !== undefined) {
    const paramName = catchAllMatch[1].slice(3); // Remove '...' prefix
    return { [paramName]: honoParams["*"] };
  }

  return {};
}
