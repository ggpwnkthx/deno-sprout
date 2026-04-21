// error.ts - Framework error types

/**
 * Machine-readable error codes used by `AppError`.
 * Use these codes to distinguish failure modes programmatically
 * rather than string-matching on error messages.
 */
export enum AppErrorCode {
  /** routesDir escaped the project root after path resolution. */
  ROUTES_DIR_ESCAPED = "ROUTES_DIR_ESCAPED",
  /** staticDir escaped the project root after path resolution. */
  STATIC_DIR_ESCAPED = "STATIC_DIR_ESCAPED",
  /** distDir escaped the project root after path resolution. */
  DIST_DIR_ESCAPED = "DIST_DIR_ESCAPED",
  /** The routes directory does not exist or is not readable. */
  ROUTES_DIR_NOT_FOUND = "ROUTES_DIR_NOT_FOUND",
  /** The island manifest (`distDir/manifest.json`) could not be read. */
  MANIFEST_LOAD_FAILED = "MANIFEST_LOAD_FAILED",
  /** A route module (e.g. _404.tsx) could not be loaded. */
  MODULE_NOT_FOUND = "MODULE_NOT_FOUND",
  /** A layout or middleware module in a manifest chain is outside the project root. */
  MODULE_OUTSIDE_ROOT = "MODULE_OUTSIDE_ROOT",
  /** Permission denied while accessing a file path. */
  PERMISSION_DENIED = "PERMISSION_DENIED",
  /** A layout module import timed out (signal fired during composeLayouts). */
  MODULE_TIMEOUT = "MODULE_TIMEOUT",
}

/**
 * A framework error with a typed `code` field and an optional HTTP status.
 * All errors thrown by the framework during init are `AppError` instances.
 */
export class AppError extends Error {
  /**
   * The machine-readable error code describing which failure occurred.
   */
  readonly code: AppErrorCode;

  /**
   * Additional context about the error (e.g. the offending path).
   */
  readonly detail?: string;

  /**
   * The HTTP status to return if this error reaches an HTTP response handler.
   * When omitted, the caller should choose an appropriate status.
   */
  readonly status?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    detail?: string,
    status?: number,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

/**
 * HTTP status codes used by `AppError`. Consumed by error page handlers.
 */
export const AppErrorStatus = {
  Forbidden: 403,
  PermissionDenied: 403,
  NotFound: 404,
  InternalServerError: 500,
} as const;

/**
 * Create an `AppError` with the given code and a template-based message.
 * The detail field is included as extra context; the status is used
 * when the error reaches an HTTP response handler.
 */
export function appError(
  code: AppErrorCode,
  message: string,
  detail?: string,
  status?: number,
): AppError {
  return new AppError(code, message, detail, status);
}
