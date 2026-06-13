// Typed runtime error for the JSX and runtime contract.
//
// `RuntimeError` carries a stable `code` and a `details` object that is
// intended to be JSON-serializable so callers can log, return, or ship
// details without leaking non-serializable values.
import type { RuntimeErrorCode } from "./types.ts";

/**
 * Error type used by the JSX and runtime contract. The `code` is a
 * stable, public member of `RuntimeErrorCode`; the `details` object is
 * frozen and intended to be JSON-serializable.
 */
export class RuntimeError extends Error {
  /** Stable error code from the `RuntimeErrorCode` union. */
  readonly code: RuntimeErrorCode;
  /** JSON-serializable details describing the failure context. */
  readonly details: Readonly<Record<string, unknown>>;
  /**
   * Build a `RuntimeError`.
   *
   * @param code Stable error code from `RuntimeErrorCode`.
   * @param message Human-readable error message.
   * @param details JSON-serializable details describing the failure
   *   context. The object is frozen before being assigned to `details`.
   */
  constructor(
    code: RuntimeErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
