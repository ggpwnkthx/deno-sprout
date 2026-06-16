// Closed list of HTTP methods the framework understands.
//
// One list, one home. `@sprout/compiler` uses this for static
// analysis of route file source; `@sprout/core` uses this for
// method dispatch and the `Allow` header. Adding a new method
// is a single edit here.
//
// `HEAD` is included: HEAD requests fall back to GET handlers
// and have the body stripped. `OPTIONS` is included for CORS-style
// flows even though `@sprout/core` does not implement CORS in M3
// (a user-supplied handler can answer `OPTIONS`).
export const SUPPORTED_HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;

export type HttpMethod = typeof SUPPORTED_HTTP_METHODS[number];

/**
 * Type guard: `true` if `method` is one of the framework's supported
 * HTTP methods. Used by the route dispatcher to decide whether a
 * method export is even worth looking up on a route module.
 */
export function isHttpMethod(method: string): method is HttpMethod {
  return (SUPPORTED_HTTP_METHODS as readonly string[]).includes(method);
}
