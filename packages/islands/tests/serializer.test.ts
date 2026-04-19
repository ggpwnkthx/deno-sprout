// serializer_test.ts - Tests for prop serialization
import { assertEquals, assertThrows } from "@std/assert";
import { deserializeProps, serializeProps } from "../serializer.ts";

Deno.test("serializeProps: round-trips primitives", () => {
  const input = { n: 1, s: "hello", flag: true, nil: null };
  const serialized = serializeProps(input);
  const deserialized = deserializeProps<typeof input>(serialized);
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: round-trips arrays", () => {
  const input = { arr: [1, 2, "three"] };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: round-trips nested objects", () => {
  const input = { nested: { a: { b: { c: 42 } } } };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: throws on function", () => {
  assertThrows(
    () => serializeProps({ fn: () => {} }),
    TypeError,
    "Island props must not contain functions",
  );
});

Deno.test("serializeProps: round-trips Date", () => {
  const input = { d: new Date("2024-01-01T00:00:00.000Z") };
  const deserialized = deserializeProps<{ d: Date }>(serializeProps(input));
  assertEquals(deserialized.d instanceof Date, true);
  assertEquals(deserialized.d.toISOString(), "2024-01-01T00:00:00.000Z");
});

Deno.test("serializeProps: output is valid base64 (no unescaped quotes)", () => {
  const input = { msg: "hello world", nested: { key: "value" } };
  const serialized = serializeProps(input);
  // Check it contains no raw " chars that would break HTML attribute
  assertEquals(serialized.includes('"'), false);
  // Should be decodable
  const decoded = deserializeProps<typeof input>(serialized);
  assertEquals(decoded, input);
});

Deno.test("deserializeProps: throws on malformed input", () => {
  assertThrows(
    () => deserializeProps("not-valid-base64!!!"),
    TypeError,
  );
});

Deno.test("serializeProps: undefined object values omitted (JSON standard)", () => {
  const input: Record<string, unknown> = { a: 1, b: undefined };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, { a: 1 }); // b is omitted
});

Deno.test("serializeProps: throws on circular reference", () => {
  const input: Record<string, unknown> = { a: 1 };
  input.self = input; // circular
  assertThrows(
    () => serializeProps(input),
    TypeError,
    "Island props must not contain circular references",
  );
});

Deno.test("serializeProps: throws on indirect circular reference", () => {
  const a: Record<string, unknown> = { b: 2 };
  const b: Record<string, unknown> = { a: a };
  a.parent = b; // a -> b -> a
  assertThrows(
    () => serializeProps(a),
    TypeError,
    "Island props must not contain circular references",
  );
});

Deno.test("serializeProps: class instances serialize to empty objects (not throw)", () => {
  class Foo {}
  const result = serializeProps({ inst: new Foo() });
  // Should not throw; class instances serialize to {}
  const deserialized = deserializeProps<{ inst: Record<string, unknown> }>(
    result,
  );
  assertEquals(deserialized.inst, {});
});

Deno.test("serializeProps: serializes numbers; Infinity/NaN become null (JSON standard)", () => {
  const input = {
    n: 42,
    inf: Infinity,
    nan: NaN,
    ninf: -Infinity,
  };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized.n, 42);
  // JSON.stringify converts Infinity/NaN to null
  assertEquals(deserialized.inf, null);
  assertEquals(deserialized.nan, null);
  assertEquals(deserialized.ninf, null);
});

Deno.test("deserializeProps: throws on invalid base64", () => {
  assertThrows(
    () => deserializeProps("not-valid-base64!!!"),
    TypeError,
    "Failed to deserialize island props",
  );
});

Deno.test("deserializeProps: throws on malformed JSON even with valid base64", () => {
  // Valid base64 but not JSON
  const validB64 = btoa("not json at all");
  assertThrows(
    () => deserializeProps(validB64),
    TypeError,
    "Failed to deserialize island props",
  );
});

Deno.test("serializeProps: round-trips empty object", () => {
  const input = {};
  assertEquals(deserializeProps<typeof input>(serializeProps(input)), input);
});

Deno.test("serializeProps: round-trips empty array", () => {
  const input: unknown[] = [];
  assertEquals(deserializeProps<unknown[]>(serializeProps(input)), input);
});

Deno.test("serializeProps: round-trips nested arrays", () => {
  const input = { matrix: [[1, 2], [3, 4]], flags: [true, false, null] };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: throws on BigInt", () => {
  assertThrows(
    () => serializeProps({ big: BigInt(42) }),
    TypeError,
  );
});

Deno.test("serializeProps: Symbol keys are omitted from output (JSON standard)", () => {
  // JSON.stringify omitsSymbol keys whose value is undefined, so the sym key
  // disappears entirely rather than appearing as null.
  const input = { a: 1, sym: Symbol("test"), b: 2 };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals("sym" in deserialized, false); // key is omitted
  assertEquals(deserialized.a, 1);
  assertEquals(deserialized.b, 2);
});

Deno.test("serializeProps: serializes plain objects (Map becomes plain object)", () => {
  const input = { map: { a: 1, b: 2 } };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: handles unicode characters in strings", () => {
  const input = { emoji: "🚀", japanese: "日本語", mixed: "hello 世界 🎉" };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: handles string with quotes and backslashes", () => {
  const input = { text: 'quote: " and backslash: \\ and newline: \n' };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("serializeProps: array with mixed types", () => {
  const input = { mixed: [1, "two", true, null, { nested: "obj" }] };
  const deserialized = deserializeProps<typeof input>(serializeProps(input));
  assertEquals(deserialized, input);
});

Deno.test("deserializeProps: empty base64 decodes to empty object", () => {
  // "e30=" is base64 for "{}"
  const result = deserializeProps<Record<string, unknown>>("e30=");
  assertEquals(result, {});
});
