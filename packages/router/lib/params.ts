// lib/params.ts - Parameter extraction from Hono route matches
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
