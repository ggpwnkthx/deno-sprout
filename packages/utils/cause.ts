// Extract a human-readable message from an error cause.
//
// The helper is a thin wrapper that normalises the shape of a
// caught `unknown` error into a string. It is intended for use at
// framework boundaries where `cause` may be an `Error`, a string,
// a number, or any other value.
export function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
