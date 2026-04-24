/**
 * Shared CSS selector helpers and hydration constants for browser tests.
 *
 * Selector functions are derived from fixture island names rather than hardcoded,
 * keeping tests decoupled from specific island implementation details.
 */

/**
 * Escape a string for use in a CSS selector.
 * Uses the browser's CSS.escape() when available, otherwise falls back
 * to a comprehensive escaping strategy covering quotes, backslashes,
 * brackets, newlines, and control characters.
 */
function cssEscape(value: string): string {
  // Use native CSS.escape if available (browser environment)
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  // Fallback escaping for non-browser or older browser environments
  // Escape quotes, backslashes, brackets, newlines, and other special chars
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20) {
      // Control characters: escape as hex
      result += `\\${code.toString(16)}`;
    } else if (char === "\\") {
      result += "\\\\";
    } else if (char === "'" || char === '"') {
      result += `\\${char}`;
    } else if (char === "[") {
      result += "\\[";
    } else if (char === "]") {
      result += "\\]";
    } else if (char === "\n") {
      result += "\\n";
    } else if (char === "\r") {
      result += "\\r";
    } else {
      result += char;
    }
  }
  return result;
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
