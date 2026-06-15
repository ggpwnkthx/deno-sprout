// Translate a manifest `RoutePattern` to a Hono route pattern.
//
// Manifest patterns may carry an optional regex constraint
// (`/files/:path{.+}` for catch-alls, `/items/:id{[0-9]+}` for
// numeric ids, etc.). Hono supports the same `:name{regex}` syntax,
// so the server preserves constraints instead of degrading catch-all
// routes to single-segment dynamic routes.
//
// Examples:
//
//   `patternToHono("/")`         → `"/"`
//   `patternToHono("/about")`    → `"/about"`
//   `patternToHono("/blog/:slug")` → `"/blog/:slug"`
//   `patternToHono("/files/:path{.+}")` → `"/files/:path{.+}"`
//   `patternToHono("/items/:id{[0-9]+}")` → `"/items/:id{[0-9]+}"`

/**
 * Map a manifest pattern to a Hono-compatible pattern. The
 * function is intentionally pure (string-in, string-out) so tests
 * can lock its behavior down.
 */
export function patternToHono(pattern: string): string {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return pattern;
  }
  return pattern;
}
