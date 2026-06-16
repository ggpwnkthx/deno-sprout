// Typed CLI errors and the human-readable error formatter.
//
// `CliError` extends the shared `FrameworkError` base class so
// callers can catch `FrameworkError` and switch on `code`. The
// closed `CliErrorCode` union is the only public surface for the
// CLI's typed failures: adding a new code is a public API change.
//
// `formatError` is the single place in the CLI that decides how
// a thrown value becomes a printable string. The rules are:
//
//   - `FrameworkError` → `error: <code>: <message>`, plus an
//     indented `details: { ... }` block when details has at least
//     one key. With `debug: true`, the original `Error.stack` is
//     also appended so users can inspect where the framework
//     failure originated (the cause is often a thrown user
//     `Error` whose full stack is the most useful signal).
//   - Any other `Error` → `error: <name>: <message>`. With
//     `debug: true`, the stack trace is appended on a new line.
//   - A non-Error throw value → `error: <stringified value>`.
//
// `formatError` is pure: it never throws and never writes to
// stdout/stderr. The caller is responsible for printing.
import { FrameworkError } from "@sprout/utils";

/** Stable error codes for the `@sprout/cli` package. */
export type CliErrorCode =
  | "CLI_UNKNOWN_COMMAND"
  | "CLI_INVALID_ARGS"
  | "CLI_INIT_TARGET_NOT_EMPTY"
  | "CLI_INIT_FAILED"
  | "CLI_INSPECT_FAILED"
  | "CLI_DEV_FAILED"
  | "CLI_SERVE_FAILED"
  | "CLI_USER_ERROR";

/**
 * Typed error for `@sprout/cli`. The `code` is one of
 * {@link CliErrorCode}; the `details` is a frozen object carrying
 * JSON-serializable context (the unknown command, the offending
 * path, the attempted port, ...).
 */
export class CliError extends FrameworkError<CliErrorCode> {
  /**
   * Build a `CliError`.
   *
   * @param code Stable error code from `CliErrorCode`.
   * @param message Human-readable error message.
   * @param details Optional JSON-serializable context object.
   */
  constructor(
    code: CliErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, details);
    this.name = "CliError";
  }
}

/** Options for {@link formatError}. */
export type FormatErrorOptions = {
  /**
   * When true, append the stack trace. For `FrameworkError`s
   * the appended trace is the `Error.stack` of the framework
   * error itself; for other `Error`s it is the stack of that
   * error. The flag is a no-op for non-Error throw values.
   */
  readonly debug?: boolean;
};

/**
 * Format any thrown value as a human-readable multi-line string.
 *
 * The output never includes a leading newline and never ends with
 * a trailing newline. Callers print it as-is. See the file header
 * for the rules the function applies.
 */
export function formatError(err: unknown, opts: FormatErrorOptions = {}): string {
  if (err instanceof FrameworkError) {
    const head = `error: ${err.code}: ${err.message}`;
    let body = head;
    if (err.details && Object.keys(err.details).length > 0) {
      const detailJson = JSON.stringify(err.details, null, 2);
      // Indent every line of the details block two spaces.
      const indented = detailJson.split("\n").map((line) => `  ${line}`).join("\n");
      body = `${head}\n  details: ${indented}`;
    }
    if (opts.debug && err.stack) {
      return `${body}\n${err.stack}`;
    }
    return body;
  }
  if (err instanceof Error) {
    const name = err.name && err.name !== "Error" ? err.name : "Error";
    const head = `error: ${name}: ${err.message}`;
    if (opts.debug && err.stack) {
      return `${head}\n${err.stack}`;
    }
    return head;
  }
  const value = typeof err === "string" ? err : JSON.stringify(err);
  return `error: ${value}`;
}
