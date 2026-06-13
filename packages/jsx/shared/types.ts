// Shared type definitions for the JSX and runtime contract.
//
// These types are re-exported from `@sprout/jsx/shared` and used by both
// the server-side placeholder emission and the browser-side mount loop.
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

export type JsonRecord = { [k: string]: JsonValue };

/**
 * Stable error codes used across the JSX and runtime contract.
 *
 * The string union is closed on purpose: adding a new code is a public
 * API change and must be reflected in the docs and tests.
 */
export type RuntimeErrorCode =
  | "INVALID_PROPS"
  | "PROPS_TOO_LARGE"
  | "INVALID_PLACEHOLDER"
  | "MOUNT_FAILED";
