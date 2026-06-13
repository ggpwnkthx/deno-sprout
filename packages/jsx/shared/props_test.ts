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
