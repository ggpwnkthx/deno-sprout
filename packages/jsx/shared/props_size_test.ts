// M8 hardening tests for `serializeJsonProps` and the
// `PROPS_TOO_LARGE` size cap.
//
// The size cap is the spec's "Enforce max serialized length" rule
// (security-and-validation.md). The default cap is 65,536 chars;
// the `maxChars` argument lets callers override it.
//
// These tests cover the boundary conditions on the cap:
//   - exactly at the cap: pass
//   - one above the cap: throw PROPS_TOO_LARGE
//   - maxChars = 0 / -1: every non-empty record is over the cap
//   - the documented default constant is the 65,536 the spec pins
import { assertEquals, assertInstanceOf } from "jsr:@std/assert@1";
import { DEFAULT_MAX_SERIALIZED_PROPS_CHARS, RuntimeError, serializeJsonProps } from "./mod.ts";

Deno.test("M8 props: DEFAULT_MAX_SERIALIZED_PROPS_CHARS is 65,536", () => {
  // The constant is the spec's "M1 spec" cap. Pin it here so a
  // future change is caught at the test boundary.
  assertEquals(DEFAULT_MAX_SERIALIZED_PROPS_CHARS, 65_536);
});

Deno.test("M8 props: a record that serializes to exactly the cap does NOT throw", () => {
  // JSON.stringify({"v": ""}) -> '{"v":""}' (8 chars). Build a
  // payload whose serialized length is exactly 65,536 by sizing
  // the value string to (cap - 8). This is the boundary case:
  // the comparison is `> maxChars` (strict), so the cap itself
  // is accepted.
  const overhead = JSON.stringify({ v: "" }).length; // 8
  const value = "x".repeat(DEFAULT_MAX_SERIALIZED_PROPS_CHARS - overhead);
  const text = serializeJsonProps({ v: value });
  assertEquals(text.length, DEFAULT_MAX_SERIALIZED_PROPS_CHARS);
});

Deno.test("M8 props: a record that serializes to cap+1 chars throws PROPS_TOO_LARGE", () => {
  const overhead = JSON.stringify({ v: "" }).length; // 8
  const value = "x".repeat(DEFAULT_MAX_SERIALIZED_PROPS_CHARS - overhead + 1);
  let caught: unknown;
  try {
    serializeJsonProps({ v: value });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
  const details = caught.details as { length: number; max: number };
  assertEquals(details.length, DEFAULT_MAX_SERIALIZED_PROPS_CHARS + 1);
  assertEquals(details.max, DEFAULT_MAX_SERIALIZED_PROPS_CHARS);
});

Deno.test("M8 props: a 200KB record throws PROPS_TOO_LARGE from the default cap", () => {
  // The 200KB JSON record is the security smoke test in the M8
  // exit criteria. The default 65,536-byte cap must reject it.
  const big = { payload: "x".repeat(200_000) };
  let caught: unknown;
  try {
    serializeJsonProps(big);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
  const details = caught.details as { length: number; max: number };
  assertEquals(details.max, DEFAULT_MAX_SERIALIZED_PROPS_CHARS);
  // The serialized length is the input + 16 ({"payload":"<n>x"} - {} + ",payload":"")
  // We don't pin the exact length; the spec only requires the
  // error to be raised, not a specific number.
  assertEquals(details.length > DEFAULT_MAX_SERIALIZED_PROPS_CHARS, true);
});

Deno.test("M8 props: maxChars: 10 throws on an 11-char record", () => {
  // {"k":"xx"} -> 10 chars. Add one more char to the value to
  // push to 11.
  let caught: unknown;
  try {
    serializeJsonProps({ k: "xxx" }, 10);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
  const details = caught.details as { length: number; max: number };
  assertEquals(details.max, 10);
  assertEquals(details.length, 11);
});

Deno.test("M8 props: maxChars: 10 accepts an exactly-10-char record", () => {
  // {"k":""} is 8 chars; pad to 10.
  // {"k": "xx"} is 10 chars.
  const text = serializeJsonProps({ k: "xx" }, 10);
  assertEquals(text.length, 10);
});

Deno.test("M8 props: maxChars: 0 throws on any non-empty record", () => {
  // A 0-byte cap is a degenerate but legal input. Any record
  // whose serialized form has at least one byte (`{}` = 2 chars)
  // must be rejected.
  let caught1: unknown;
  try {
    serializeJsonProps({}, 0);
  } catch (e) {
    caught1 = e;
  }
  assertInstanceOf(caught1, RuntimeError);
  assertEquals(caught1.code, "PROPS_TOO_LARGE");

  let caught2: unknown;
  try {
    serializeJsonProps({ a: 1 }, 0);
  } catch (e) {
    caught2 = e;
  }
  assertInstanceOf(caught2, RuntimeError);
  assertEquals(caught2.code, "PROPS_TOO_LARGE");
});

Deno.test("M8 props: maxChars: -1 throws on any non-empty record", () => {
  // A negative cap means "no positive limit", which the spec
  // treats as "any non-empty result throws". The 0-cap edge
  // case has the same behavior; pin it.
  let caught1: unknown;
  try {
    serializeJsonProps({}, -1);
  } catch (e) {
    caught1 = e;
  }
  assertInstanceOf(caught1, RuntimeError);
  assertEquals(caught1.code, "PROPS_TOO_LARGE");

  let caught2: unknown;
  try {
    serializeJsonProps({ a: 1 }, -1);
  } catch (e) {
    caught2 = e;
  }
  assertInstanceOf(caught2, RuntimeError);
  assertEquals(caught2.code, "PROPS_TOO_LARGE");
});

Deno.test("M8 props: maxChars: 65,535 (cap-1) accepts the same payload that cap rejects", () => {
  // The boundary is "strictly greater than maxChars". A maxChars
  // of 65,535 must accept a payload of length 65,535.
  // {"v":"<n>x"} = 8 + n chars. For n = 65,527, total = 65,535.
  const value = "x".repeat(65_527);
  const text = serializeJsonProps({ v: value }, 65_535);
  assertEquals(text.length, 65_535);
  // And a payload of 65,536 is rejected at this cap.
  let caught: unknown;
  try {
    serializeJsonProps({ v: "x".repeat(65_528) }, 65_535);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "PROPS_TOO_LARGE");
});
