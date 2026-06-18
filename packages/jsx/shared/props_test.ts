// Tests for the JSON prop serializer and parser. Covers accept and reject
// paths, the size cap, and the round-trip with the parser.
import {
  assertEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import {
  DEFAULT_MAX_SERIALIZED_PROPS_CHARS,
  parseJsonProps,
  RuntimeError,
  serializeJsonProps,
} from "./mod.ts";

Deno.test("serializeJsonProps accepts plain records and nested JSON", () => {
  const text = serializeJsonProps({ a: 1, b: "x", c: true, d: null });
  assertEquals(parseJsonProps(text), { a: 1, b: "x", c: true, d: null });
});

Deno.test("serializeJsonProps accepts nested records and arrays of records", () => {
  const value = {
    list: [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ],
    meta: { total: 2, ok: true },
  };
  const text = serializeJsonProps(value);
  assertEquals(parseJsonProps(text), value);
});

Deno.test("serializeJsonProps accepts finite numbers, strings, booleans, null nested", () => {
  const text = serializeJsonProps({ n: 0, s: "", b: false, z: null });
  assertEquals(JSON.parse(text), { n: 0, s: "", b: false, z: null });
});

Deno.test("serializeJsonProps rejects functions", () => {
  assertThrows(
    () => serializeJsonProps({ fn: () => 1 }),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("serializeJsonProps rejects symbols", () => {
  assertThrows(
    () => serializeJsonProps({ s: Symbol("x") }),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("serializeJsonProps rejects bigint", () => {
  assertThrows(
    () => serializeJsonProps({ n: 1n }),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("serializeJsonProps rejects Date", () => {
  assertThrows(
    () => serializeJsonProps({ d: new Date() }),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("serializeJsonProps rejects class instances", () => {
  class Box {
    constructor(public n: number) {}
  }
  let caught: unknown;
  try {
    serializeJsonProps({ b: new Box(1) });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "class_instance");
});

Deno.test("serializeJsonProps rejects nested Date with reason 'date'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ d: new Date() });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "date");
});

Deno.test("serializeJsonProps rejects nested Map with reason 'map'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ m: new Map() });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "map");
});

Deno.test("serializeJsonProps rejects nested Set with reason 'set'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ s: new Set() });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "set");
});

Deno.test("serializeJsonProps rejects nested ArrayBuffer with reason 'typed_array'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ a: new ArrayBuffer(8) });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "typed_array");
});

Deno.test("serializeJsonProps rejects nested Uint8Array with reason 'typed_array'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ u: new Uint8Array([1, 2, 3]) });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "typed_array");
});

Deno.test("serializeJsonProps rejects nested Promise with reason 'promise'", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ p: Promise.resolve(1) });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "promise");
});

Deno.test("serializeJsonProps rejects undefined at any position", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ u: undefined });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "undefined");
});

Deno.test("serializeJsonProps rejects top-level arrays", () => {
  let caught: unknown;
  try {
    serializeJsonProps([1, 2, 3]);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("serializeJsonProps rejects top-level null", () => {
  let caught: unknown;
  try {
    serializeJsonProps(null);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("serializeJsonProps rejects circular structures", () => {
  const a: Record<string, unknown> = { name: "a" };
  a.self = a;
  let caught: unknown;
  try {
    serializeJsonProps(a);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "circular");
});

Deno.test("serializeJsonProps throws PROPS_TOO_LARGE for oversized records", () => {
  const big = { payload: "x".repeat(DEFAULT_MAX_SERIALIZED_PROPS_CHARS) };
  let caught: unknown;
  try {
    serializeJsonProps(big);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
  assertEquals(typeof caught.details.length, "number");
  assertEquals(caught.details.max, DEFAULT_MAX_SERIALIZED_PROPS_CHARS);
});

Deno.test("parseJsonProps round-trips with serializeJsonProps", () => {
  const value = { count: 3, items: ["a", "b"], flag: true, none: null };
  const text = serializeJsonProps(value);
  assertEquals(parseJsonProps(text), value);
});

Deno.test("parseJsonProps throws on invalid JSON", () => {
  let caught: unknown;
  try {
    parseJsonProps("{not json");
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "json_parse");
});

Deno.test("parseJsonProps throws on top-level array", () => {
  let caught: unknown;
  try {
    parseJsonProps("[1,2,3]");
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("parseJsonProps throws on top-level null", () => {
  let caught: unknown;
  try {
    parseJsonProps("null");
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("parseJsonProps error message names JSON", () => {
  let caught: unknown;
  try {
    parseJsonProps("nope");
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertStringIncludes(caught.message, "JSON");
});

Deno.test("serializeJsonProps rejects top-level Date as not_record", () => {
  let caught: unknown;
  try {
    serializeJsonProps(new Date() as unknown as Record<string, unknown>);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("serializeJsonProps rejects top-level Map as not_record", () => {
  let caught: unknown;
  try {
    serializeJsonProps(new Map() as unknown as Record<string, unknown>);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("serializeJsonProps rejects top-level Set as not_record", () => {
  let caught: unknown;
  try {
    serializeJsonProps(new Set() as unknown as Record<string, unknown>);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("serializeJsonProps rejects top-level ArrayBuffer as not_record", () => {
  let caught: unknown;
  try {
    serializeJsonProps(new ArrayBuffer(8) as unknown as Record<string, unknown>);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.details.reason, "not_record");
});

Deno.test("validateJsonValue: nested class instance has path in details", () => {
  class Box {
    constructor(public n: number) {}
  }
  let caught: unknown;
  try {
    serializeJsonProps({ outer: { inner: new Box(1) } });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
  assertEquals(caught.details.reason, "class_instance");
  // Path is non-empty for nested values; the leading dot is from the first
  // key concatenation (path starts as "" and becomes ".outer.inner").
  assertEquals(typeof caught.details.path, "string");
  assertEquals(caught.details.path, ".outer.inner");
});

Deno.test("serializeJsonProps: root has dotted path for nested undefined", () => {
  // When undefined appears nested, the path reflects its position.
  let caught: unknown;
  try {
    serializeJsonProps({ u: undefined });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  // Path starts with . from the initial "" + "." + "u" concatenation.
  assertEquals(caught.details.path, ".u");
});

Deno.test("serializeJsonProps: maxChars 0 throws PROPS_TOO_LARGE for non-empty record", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ a: 1 }, 0);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
});

Deno.test("serializeJsonProps: maxChars negative throws PROPS_TOO_LARGE for non-empty record", () => {
  let caught: unknown;
  try {
    serializeJsonProps({ a: 1 }, -1);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
});

Deno.test("serializeJsonProps: maxChars 0 throws even for the empty record", () => {
  // "{}" is 2 chars, so maxChars=0 should fail.
  let caught: unknown;
  try {
    serializeJsonProps({}, 0);
  } catch (e) {
    caught = e;
  }
  // Actually {} serializes to "{}" which is 2 chars > 0, so this throws.
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
});

Deno.test("serializeJsonProps: maxChars 2 accepts empty record", () => {
  // "{}" is 2 chars, so maxChars=2 should pass.
  const text = serializeJsonProps({}, 2);
  assertEquals(text, "{}");
});
