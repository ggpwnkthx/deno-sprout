// Typed config errors.
//
// `ConfigError` extends `FrameworkError` so callers can catch the base
// class and still discriminate on `code`. The `ConfigErrorCode` union
// is closed: adding a new code is a public API change.
import { FrameworkError } from "@sprout/utils";

/** Stable error codes for the `@sprout/config` package. */
export type ConfigErrorCode =
  | "CONFIG_IMPORT_FAILED"
  | "CONFIG_INVALID_SHAPE"
  | "CONFIG_INVALID_PATH"
  | "CONFIG_PATH_OUTSIDE_ROOT"
  | "CONFIG_INVALID_PORT"
  | "CONFIG_INVALID_CACHE_POLICY"
  | "CONFIG_INVALID_HOSTNAME"; // invalid server.hostname value

/**
 * Typed error for `@sprout/config`. The `code` is one of
 * {@link ConfigErrorCode}; the `details` is a frozen object carrying
 * JSON-serializable context (for example, the offending path or
 * offending field name).
 */
export class ConfigError extends FrameworkError<ConfigErrorCode> {
  /**
   * Build a `ConfigError`.
   *
   * @param code Stable error code from `ConfigErrorCode`.
   * @param message Human-readable error message.
   * @param details Optional JSON-serializable context object.
   * @param cause Optional underlying error or value. Preserved on
   *   `Error.cause` so the full chain is walkable.
   */
  constructor(
    code: ConfigErrorCode,
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(code, message, details, cause);
    this.name = "ConfigError";
  }
}
