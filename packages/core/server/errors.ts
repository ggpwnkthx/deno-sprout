// Typed errors for `@sprout/core` and the response converter that
// turns them into HTTP responses with stable bodies.
//
// The error codes are a closed union. Adding a new code is a public
// API change.
//
// `coreErrorToResponse` is the only place in the M3 server that
// decides "how does an error become a status code". The M3 conversion
// is intentionally minimal: 404 for missing routes / static files,
// 405 with an `Allow` header for method mismatches, 500 for anything
// else. The M7 production serve may upgrade the 500 path with
// `X-Content-Type-Options: nosniff` and stricter bodies.
import { FrameworkError, NOSNIFF } from "@sprout/utils";
import { SUPPORTED_HTTP_METHODS } from "@sprout/utils";
import type { HttpMethod } from "@sprout/utils";

/** Stable error codes for the `@sprout/core` package. */
export type CoreErrorCode =
  | "ROUTE_NOT_FOUND"
  | "ROUTE_METHOD_NOT_ALLOWED"
  | "ROUTE_IMPORT_FAILED"
  | "ROUTE_INVALID_EXPORT"
  | "ROUTE_RENDER_FAILED"
  | "STATIC_FILE_NOT_FOUND"
  | "STATIC_FILE_OUTSIDE_ROOT";

/**
 * Typed error for `@sprout/core`. The `code` is one of
 * {@link CoreErrorCode}; `details` is a frozen object carrying
 * JSON-serializable context (the offending path, the conflicting
 * methods, the upstream error, ...).
 */
export class CoreError extends FrameworkError<CoreErrorCode> {
  constructor(
    code: CoreErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = "CoreError";
  }
}

/**
 * Build the body string for a {@link CoreError} response. Kept as a
 * separate function so tests can assert on the body without
 * constructing a full `Response`. The body is plain text: M3 keeps
 * the wire format minimal; the M4 dev server adds overlay-free HTML.
 */
export function coreErrorBody(err: CoreError, fallback: string): string {
  if (typeof err.message === "string" && err.message.length > 0) {
    return err.message;
  }
  return fallback;
}

/**
 * Build a fallback 500 body for unexpected errors. The body is
 * intentionally short and free of internals.
 */
function default500Body(): string {
  return "Internal Server Error";
}

/**
 * Convert a {@link CoreError} into a typed HTTP `Response`.
 *
 * Mapping:
 *   - `ROUTE_NOT_FOUND`         → 404 with the error message
 *   - `ROUTE_METHOD_NOT_ALLOWED` → 405 with an `Allow` header listing
 *     the methods that *are* present on the matched route (or the
 *     supported default methods when none are present)
 *   - `STATIC_FILE_NOT_FOUND`   → 404 with the error message
 *   - `STATIC_FILE_OUTSIDE_ROOT`→ 404 with a generic message (do not
 *     leak the requested path to the client)
 *   - everything else            → 500 with a short message
 */
export function coreErrorToResponse(err: CoreError): Response {
  switch (err.code) {
    case "ROUTE_NOT_FOUND":
    case "STATIC_FILE_NOT_FOUND": {
      return new Response(coreErrorBody(err, "Not Found"), {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
    case "STATIC_FILE_OUTSIDE_ROOT": {
      // Use a generic message; the requested path stays in `details`
      // for server-side logs.
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
    case "ROUTE_METHOD_NOT_ALLOWED": {
      const allowed = (err.details as { readonly methods?: readonly HttpMethod[] }).methods ??
        SUPPORTED_HTTP_METHODS;
      const allow = allowed.join(", ");
      return new Response(coreErrorBody(err, "Method Not Allowed"), {
        status: 405,
        headers: {
          "allow": allow,
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
    case "ROUTE_IMPORT_FAILED":
    case "ROUTE_INVALID_EXPORT":
    case "ROUTE_RENDER_FAILED": {
      return new Response(coreErrorBody(err, default500Body()), {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
  }
}
