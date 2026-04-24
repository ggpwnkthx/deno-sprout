/**
 * Shared CSS selector helpers and hydration constants for browser tests.
 *
 * Selector functions are derived from fixture island names rather than hardcoded,
 * keeping tests decoupled from specific island implementation details.
 */

function cssEscape(value: string): string {
  return value.replace(/['"]/g, (c) => `\\${c}`);
}

export { cssEscape };

/** Attribute set on an island element after client-side hydration completes. */
export const DATA_HYDRATED_ATTR = "data-hydrated";

/** Build a data-island attribute selector for a named island. */
export function islandSelector(name: string): string {
  return `[data-island='${cssEscape(name)}']`;
}

/** Counter value selector suffix — ".count" span inside an island element. */
export const COUNTER_VALUE_SELECTOR = " .count";

/** Counter value selector for a named island. */
export function counterValueSelector(islandName: string): string {
  return `${islandSelector(islandName)}${COUNTER_VALUE_SELECTOR}`;
}
