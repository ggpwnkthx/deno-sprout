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
