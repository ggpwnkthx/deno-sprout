// Base framework error class shared by every Sprout package.
//
// `FrameworkError` carries a stable `code` and a `details` object that is
// frozen and intended to be JSON-serializable. The `code` is a literal
// string union; callers may narrow on it with a discriminated union and
// pattern matching.
//
// The class is generic so that individual packages can publish their own
// narrower code unions while still sharing the same shape:
//
// ```ts
// export class CompilerError extends FrameworkError<CompilerErrorCode> {
//   constructor(
//     code: CompilerErrorCode,
//     message: string,
//     details?: Record<string, unknown>,
//   ) {
//     super(code, message, details);
//     this.name = "CompilerError";
//   }
// }
// ```
//
// `details` is shallowly frozen: top-level fields are read-only, but nested
// values are not deep-frozen. Callers that need deeper safety should clone
// and freeze nested values themselves.
/** Frozen, JSON-serializable details object carried by every `FrameworkError`. */
export type FrameworkErrorDetails = Readonly<Record<string, unknown>>;

/**
 * Base typed error for every Sprout package.
 *
 * The `code` is a stable identifier from the package's error-code union.
 * The `details` object is shallowly frozen and intended to carry
 * JSON-serializable context. The `message` is a human-readable string.
 *
 * Subclasses are expected to override `name` to the package-specific
 * error name (for example `"ConfigError"` or `"CompilerError"`).
 */
export class FrameworkError<
  Code extends string,
  Details extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  /** Stable error code from the package's error-code union. */
  readonly code: Code;
  /** Frozen, JSON-serializable context describing the failure. */
  readonly details: Readonly<Details>;

  /**
   * Build a `FrameworkError`.
   *
   * @param code Stable error code.
   * @param message Human-readable error message.
   * @param details Optional context object. A shallow copy is frozen
   *   before being assigned to `details`.
   */
  constructor(code: Code, message: string, details?: Details) {
    super(message);
    this.name = "FrameworkError";
    this.code = code;
    this.details = Object.freeze({ ...(details ?? {}) }) as Readonly<Details>;
  }
}
