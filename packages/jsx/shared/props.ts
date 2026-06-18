// JSON prop serialization and parsing for island placeholders.
//
// `serializeJsonProps` validates a JavaScript value against the island
// prop contract (plain record at the top level, finite JSON values inside,
// no cycles) and returns a JSON string. The size is bounded by
// `DEFAULT_MAX_SERIALIZED_PROPS_CHARS`.
//
// `parseJsonProps` is the inverse: it accepts a string, returns a plain
// `JsonRecord`, and validates the result shape.
//
// Both functions throw `RuntimeError` with stable codes so callers can
// distinguish validation failures from size limits.
import { RuntimeError } from "./errors.ts";
import type { JsonRecord, JsonValue } from "./types.ts";

/** Default cap for the JSON-serialized island props, in characters. */
export const DEFAULT_MAX_SERIALIZED_PROPS_CHARS = 65_536;

const INVALID_PROPS_MESSAGE = "props must be a plain JSON object";
const PROPS_TOO_LARGE_MESSAGE = "serialized props exceed the configured size limit";
const PROPS_NOT_JSON_MESSAGE = "props must be valid JSON";

/**
 * Check whether a plain object has `Object.prototype` (or `null`).
 * Used to distinguish plain objects from class instances.
 */
function hasPlainObjectPrototype(value: object | null): boolean {
  if (value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Check whether a value is a plain object record (or array) suitable for
 * JSON serialization. Returns `true` for plain records, plain arrays, and
 * primitives; `false` for class instances, dates, maps, sets, etc.
 */
function isPlainJsonContainer(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (t !== "object") {
    return false;
  }
  // Reject Date, Map, Set, ArrayBuffer, TypedArray, Promise, etc.
  if (value instanceof Date) {
    return false;
  }
  if (value instanceof Map || value instanceof Set) {
    return false;
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return false;
  }
  if (value instanceof Promise) {
    return false;
  }
  return hasPlainObjectPrototype(value as object);
}

function failInvalidProps(
  reason: string,
  path: string,
): never {
  throw new RuntimeError("INVALID_PROPS", INVALID_PROPS_MESSAGE, {
    reason,
    path: path || undefined,
  });
}

/**
 * Walk `value` and reject anything that is not a JSON-compatible subtree.
 * Throws `RuntimeError("INVALID_PROPS", ..., { reason })` on the first
 * problem. The `seen` WeakSet tracks objects to detect cycles; the
 * caller is responsible for adding the top-level value to `seen`
 * before calling if the top-level cycle is meaningful.
 */
function validateJsonValue(
  value: unknown,
  seen: WeakSet<object>,
  path: string,
): JsonValue {
  if (value === null) {
    return null;
  }
  const t = typeof value;
  if (t === "string") {
    return value as string;
  }
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      failInvalidProps("non_finite_number", path);
    }
    return value as number;
  }
  if (t === "boolean") {
    return value as boolean;
  }
  if (t === "undefined") {
    failInvalidProps("undefined", path);
  }
  if (t === "bigint") {
    failInvalidProps("bigint", path);
  }
  if (t === "symbol") {
    failInvalidProps("symbol", path);
  }
  if (t === "function") {
    failInvalidProps("function", path);
  }
  // typeof === "object" branch.
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      failInvalidProps("circular", path);
    }
    seen.add(value);
    const out: JsonValue[] = [];
    for (let i = 0; i < value.length; i++) {
      out.push(validateJsonValue(value[i], seen, `${path}[${i}]`));
    }
    return out;
  }
  if (value instanceof Date) {
    failInvalidProps("date", path);
  }
  if (value instanceof Map) {
    failInvalidProps("map", path);
  }
  if (value instanceof Set) {
    failInvalidProps("set", path);
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    failInvalidProps("typed_array", path);
  }
  if (value instanceof Promise) {
    failInvalidProps("promise", path);
  }
  if (!hasPlainObjectPrototype(value as object)) {
    failInvalidProps("class_instance", path);
  }
  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) {
    failInvalidProps("circular", path);
  }
  seen.add(obj);
  const out: { [k: string]: JsonValue } = {};
  for (const key of Object.keys(obj)) {
    out[key] = validateJsonValue(obj[key], seen, `${path}.${key}`);
  }
  return out;
}

/**
 * Serialize a JavaScript value as JSON for an island placeholder.
 *
 * The top-level value must be a plain object record. Nested values must be
 * JSON-compatible (string, finite number, boolean, null, plain array, plain
 * record). Cycles, `undefined`, functions, `bigint`, `Date`, class
 * instances, maps, sets, and typed arrays are all rejected. Nested values
 * of type `Date`, `Map`, `Set`, typed array, or `Promise` throw with their
 * specific `details.reason`; class instances throw with
 * `details.reason: "class_instance"`; top-level non-record values throw
 * with `details.reason: "not_record"`.
 *
 * The serialized string is bounded by `maxChars` (default
 * {@link DEFAULT_MAX_SERIALIZED_PROPS_CHARS}). On overflow the function
 * throws `RuntimeError("PROPS_TOO_LARGE", ...)`. `maxChars` of `0` or
 * a negative value will throw `PROPS_TOO_LARGE` for any non-empty record
 * (an empty record serializes to `"{}"` and passes only when `maxChars >= 2`).
 */
export function serializeJsonProps(
  value: unknown,
  maxChars: number = DEFAULT_MAX_SERIALIZED_PROPS_CHARS,
): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RuntimeError("INVALID_PROPS", INVALID_PROPS_MESSAGE, {
      reason: "not_record",
    });
  }
  if (!isPlainJsonContainer(value)) {
    throw new RuntimeError("INVALID_PROPS", INVALID_PROPS_MESSAGE, {
      reason: "not_record",
    });
  }
  const seen = new WeakSet<object>();
  // `validateJsonValue` adds `value` to `seen` itself before recursing
  // into children, so we do not pre-add the root here.
  const validated = validateJsonValue(value, seen, "");
  const text = JSON.stringify(validated);
  if (text.length > maxChars) {
    throw new RuntimeError("PROPS_TOO_LARGE", PROPS_TOO_LARGE_MESSAGE, {
      length: text.length,
      max: maxChars,
    });
  }
  return text;
}

/**
 * Parse a JSON-serialized island props string into a plain object record.
 *
 * Throws `RuntimeError("INVALID_PROPS", ..., { reason: "json_parse" })` on
 * invalid JSON, and `RuntimeError("INVALID_PROPS", ..., { reason:
 * "not_record" })` if the parsed value is not a plain object record (e.g.
 * top-level array, `null`, primitive).
 */
export function parseJsonProps(text: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new RuntimeError(
      "INVALID_PROPS",
      PROPS_NOT_JSON_MESSAGE,
      { reason: "json_parse" },
      cause,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RuntimeError("INVALID_PROPS", INVALID_PROPS_MESSAGE, {
      reason: "not_record",
    });
  }
  return parsed as JsonRecord;
}
