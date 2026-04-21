/**
 * @fileoverview Props validation helpers for island components.
 */

/**
 * Validates that a value is a suitable props object for an island component.
 *
 * Checks that the value is a non-null object (i.e., a plain object or array).
 * This is a shallow check; it does not validate individual prop types.
 *
 * @param props - The value to validate
 * @returns `true` if props is a non-null object, `false` otherwise
 */
export function validateProps(props: unknown): boolean {
  return typeof props === "object" && props !== null;
}
