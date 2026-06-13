// The closed set of HTTP methods the framework understands.
//
// The list intentionally includes `HEAD`: HEAD requests fall back to
// GET handlers and have the body stripped. `OPTIONS` is included for
// CORS-style flows even though `@sprout/core` does not implement
// CORS in M3 (a user-supplied handler can answer `OPTIONS`).
export const SUPPORTED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export type HttpMethod = typeof SUPPORTED_METHODS[number];

/**
 * Type guard: `true` if `method` is one of the framework's supported
 * HTTP methods. Used by the route dispatcher to decide whether a
 * method export is even worth looking up on a route module.
 */
export function isHttpMethod(method: string): method is HttpMethod {
  return (SUPPORTED_METHODS as readonly string[]).includes(method);
}
