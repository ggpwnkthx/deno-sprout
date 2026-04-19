// props_test.ts - Tests for validateProps helper
import { assertEquals } from "@std/assert";
import { validateProps } from "../lib/props.ts";

Deno.test("validateProps: returns true for plain object", () => {
  assertEquals(validateProps({ a: 1, b: 2 }), true);
});

Deno.test("validateProps: returns true for array", () => {
  // typeof array is 'object', so it passes
  assertEquals(validateProps([1, 2, 3]), true);
});

Deno.test("validateProps: returns false for null", () => {
  assertEquals(validateProps(null), false);
});

Deno.test("validateProps: returns false for undefined", () => {
  assertEquals(validateProps(undefined), false);
});

Deno.test("validateProps: returns false for primitives", () => {
  assertEquals(validateProps(42), false);
  assertEquals(validateProps("string"), false);
  assertEquals(validateProps(true), false);
});

Deno.test("validateProps: returns true for nested objects", () => {
  assertEquals(validateProps({ nested: { a: { b: { c: 42 } } } }), true);
});

Deno.test("validateProps: returns true for Map", () => {
  assertEquals(validateProps(new Map([["a", 1]])), true);
});

Deno.test("validateProps: returns true for Set", () => {
  assertEquals(validateProps(new Set([1, 2, 3])), true);
});

Deno.test("validateProps: returns true for Date", () => {
  assertEquals(validateProps(new Date()), true);
});

Deno.test("validateProps: returns true for Error", () => {
  assertEquals(validateProps(new Error("oops")), true);
});

Deno.test("validateProps: returns true for RegExp", () => {
  assertEquals(validateProps(/^test$/), true);
});

Deno.test("validateProps: returns true for Promise", () => {
  assertEquals(validateProps(Promise.resolve(1)), true);
});

Deno.test("validateProps: returns true for WeakMap (non-iterable)", () => {
  // WeakMap is iterable only in spec, but typeof is object
  const wm = new WeakMap();
  assertEquals(validateProps(wm), true);
});

Deno.test("validateProps: returns false for BigInt", () => {
  assertEquals(validateProps(BigInt(42)), false);
});

Deno.test("validateProps: returns false for Symbol", () => {
  assertEquals(validateProps(Symbol("test")), false);
});

Deno.test("validateProps: returns false for function", () => {
  assertEquals(validateProps(() => {}), false);
});

Deno.test("validateProps: returns false for arrow function", () => {
  assertEquals(validateProps((x: number) => x * 2), false);
});
