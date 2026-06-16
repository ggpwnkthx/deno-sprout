// Typed runtime error for the JSX and runtime contract.
//
// `RuntimeError` extends the shared `FrameworkError<Code>` base class
// from `@sprout/utils` so callers can use `err instanceof FrameworkError`
// to discriminate typed errors from generic ones. The `code` is a
// stable, public member of `RuntimeErrorCode`; the `details` object is
// shallowly frozen and intended to be JSON-serializable.
import { FrameworkError } from "@sprout/utils";
import type { RuntimeErrorCode } from "./types.ts";

/**
 * Error type used by the JSX and runtime contract. The `code` is a
 * stable, public member of `RuntimeErrorCode`; the `details` object is
 * frozen and intended to be JSON-serializable.
 */
export class RuntimeError extends FrameworkError<RuntimeErrorCode> {
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
    super(code, message, details);
    this.name = "RuntimeError";
  }
}
