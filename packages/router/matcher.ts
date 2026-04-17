// matcher.ts - Route matching utilities
export interface RouteMatch {
  pattern: string;
  params: Record<string, string>;
}

export type RoutePattern = string | URLPattern;

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

export function generatePath(
  pattern: string,
  params?: Record<string, string>,
): string {
  if (!params) return pattern;
  return pattern.replace(/:(\w+)/g, (_, key) => params[key] ?? "");
}
