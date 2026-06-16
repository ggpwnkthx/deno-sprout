// Extract a human-readable message from an error cause.
//
// The helper is a thin wrapper that normalises the shape of a
// caught `unknown` error into a string. It is intended for use at
// framework boundaries where `cause` may be an `Error`, a string,
// a number, or any other value.
/**
 * Return a human-readable message for `cause`.
 *
 * `cause` may be an `Error`, a string, a number, or any other value.
 * Returns the `Error.message`, or `String(cause)` for non-Error values.
 *
 * @param cause An unknown error value.
 * @returns The error message as a string.
 */
export function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
