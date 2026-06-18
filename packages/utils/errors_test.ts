// Tests for the base `FrameworkError` class. The shape (code, message,
// details, name) is the contract every package-specific subclass
// depends on.
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { FrameworkError } from "./errors.ts";

Deno.test("FrameworkError exposes code, message, details, and name", () => {
  const err = new FrameworkError("CODE", "boom", { a: 1, b: "two" });
  assertEquals(err.code, "CODE");
  assertEquals(err.message, "boom");
  assertEquals(err.details, { a: 1, b: "two" });
  assertEquals(err.name, "FrameworkError");
  assertStrictEquals(err instanceof Error, true);
});

Deno.test("FrameworkError.details is shallowly frozen", () => {
  const err = new FrameworkError("CODE", "boom", { a: 1 });
  assertEquals(Object.isFrozen(err.details), true);
});

Deno.test("FrameworkError defaults details to an empty frozen object", () => {
  const err = new FrameworkError("CODE", "boom");
  assertEquals(err.details, {});
  assertEquals(Object.isFrozen(err.details), true);
});

Deno.test("FrameworkError accepts a code-typed generic and narrows details", () => {
  type Code = "X" | "Y";
  type Details = { readonly a: number };
  const err = new FrameworkError<Code, Details>("X", "boom", { a: 1 });
  // The generic constrains `code` and `details`; the runtime contract
  // is unchanged.
  assertEquals(err.code, "X");
  assertEquals(err.details.a, 1);
});

Deno.test("FrameworkError: no cause -> err.cause is undefined", () => {
  const err = new FrameworkError("CODE", "boom");
  assertStrictEquals(err.cause, undefined);
});

Deno.test("FrameworkError: structured cause is preserved on Error.cause chain", () => {
  const original = new Error("root cause");
  const err = new FrameworkError("CODE", "boom", {}, original);
  assertStrictEquals(err.cause, original);
  // The cause chain is walkable.
  assertEquals((err.cause as Error).message, "root cause");
});
