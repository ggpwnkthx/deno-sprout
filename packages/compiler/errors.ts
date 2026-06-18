// Typed compiler errors.
//
// CompilerError extends FrameworkError so callers can catch the
// base class and still discriminate on code. The
// CompilerErrorCode union is closed: adding a new code is a public
// API change.
import { FrameworkError } from "@sprout/utils";

/** Stable error codes for the `@sprout/compiler` package. */
export type CompilerErrorCode =
  | "DISCOVERY_ROOT_MISSING"
  | "DISCOVERY_ROUTE_CONFLICT"
  | "DISCOVERY_ISLAND_CONFLICT"
  | "DISCOVERY_INVALID_ROUTE_FILE"
  | "DISCOVERY_INVALID_ISLAND_FILE"
  | "DISCOVERY_INVALID_STYLE_FILE"
  | "MANIFEST_DUPLICATE_ID"
  | "MANIFEST_INVALID_PUBLIC_PATH"
  | "MANIFEST_RESERVED_PATH_COLLISION"
  | "BUILD_FAILED"
  | "BUILD_OUTPUT_MISSING"
  | "BUILD_OUTDIR_UNSAFE"
  | "FROZEN_MANIFEST_MISSING"
  | "FROZEN_MANIFEST_UNSUPPORTED"
  | "FROZEN_ASSET_MISSING"
  | "FROZEN_ASSET_TOO_LARGE";

/**
 * Typed error for @sprout/compiler. The code is one of
 * CompilerErrorCode; the details is a frozen object carrying
 * JSON-serializable context (for example, the conflicting files
 * or the offending public path).
 */
export class CompilerError extends FrameworkError<CompilerErrorCode> {
  /**
   * Build a `CompilerError`.
   *
   * @param code Stable error code from `CompilerErrorCode`.
   * @param message Human-readable error message.
   * @param details Optional JSON-serializable context object.
   * @param cause Optional underlying error or value. Preserved on
   *   `Error.cause` so the full chain is walkable.
   */
  constructor(
    code: CompilerErrorCode,
    message: string,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(code, message, details, cause);
    this.name = "CompilerError";
  }
}
