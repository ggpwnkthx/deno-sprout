// stringify_test.ts - Tests for stringify.ts utilities
/// <reference lib="dom" />
import { assertEquals } from "@std/assert";
import {
  getIslandName,
  HydrationError,
  IslandErrorEvent,
  RenderError,
  renderToString,
  validateProps,
} from "../lib/stringify.ts";
import type { FC } from "@hono/hono/jsx";

Deno.test("renderToString: returns component.toString() result", () => {
  const Component: FC<{ name: string }> = ({ name }) =>
    `<div>Hello ${name}</div>` as unknown as ReturnType<FC<{ name: string }>>;

  const result = renderToString(Component({ name: "world" }));
  assertEquals(result, "<div>Hello world</div>");
});

Deno.test("renderToString: throws RenderError for null component", () => {
  let threw = false;
  let caught: unknown;
  try {
    // deno-lint-ignore no-explicit-any
    renderToString(null as any);
  } catch (e) {
    threw = true;
    caught = e;
  }
  assertEquals(threw, true);
  assertEquals(caught instanceof RenderError, true);
  assertEquals(
    (caught as RenderError).message,
    "Component returned null or undefined",
  );
});

Deno.test("renderToString: throws RenderError for undefined component", () => {
  let threw = false;
  let caught: unknown;
  try {
    // deno-lint-ignore no-explicit-any
    renderToString(undefined as any);
  } catch (e) {
    threw = true;
    caught = e;
  }
  assertEquals(threw, true);
  assertEquals(caught instanceof RenderError, true);
  assertEquals(
    (caught as RenderError).message,
    "Component returned null or undefined",
  );
});

Deno.test("renderToString: throws RenderError when toString() returns non-string", () => {
  // A component whose toString() returns a Promise (async component simulation)
  const asyncComponent = {
    toString: () => Promise.resolve("<div>async</div>"),
  };

  let threw = false;
  let caught: unknown;
  try {
    // deno-lint-ignore no-explicit-any
    renderToString(asyncComponent as any);
  } catch (e) {
    threw = true;
    caught = e;
  }
  assertEquals(threw, true);
  assertEquals(caught instanceof RenderError, true);
  assertEquals(
    (caught as RenderError).message,
    "Async component is not supported in renderToString",
  );
});

Deno.test("renderToString: RenderError carries reason from thrown toString()", () => {
  const innerError = new Error("inner cause");
  const componentWithReason = {
    toString: () => {
      throw innerError;
    },
  };

  let caught: unknown;
  try {
    // deno-lint-ignore no-explicit-any
    renderToString(componentWithReason as any);
  } catch (e) {
    caught = e;
  }
  assertEquals(caught instanceof RenderError, true);
  const reason = (caught as RenderError).reason as Error | undefined;
  assertEquals(reason instanceof Error, true);
  assertEquals(reason?.message, "inner cause");
});

Deno.test("validateProps: returns true for plain objects", () => {
  assertEquals(validateProps({}), true);
  assertEquals(validateProps({ a: 1 }), true);
  assertEquals(validateProps([]), true);
  assertEquals(validateProps([1, 2, 3]), true);
});

Deno.test("validateProps: returns false for null and primitives", () => {
  assertEquals(validateProps(null), false);
  assertEquals(validateProps(undefined), false);
  assertEquals(validateProps(42), false);
  assertEquals(validateProps("string"), false);
  assertEquals(validateProps(true), false);
  assertEquals(validateProps(() => {}), false);
});

Deno.test("getIslandName: returns data-island attribute value", () => {
  const el = {
    getAttribute: (name: string) => name === "data-island" ? "Counter" : null,
  } as unknown as Element;

  assertEquals(getIslandName(el), "Counter");
});

Deno.test("getIslandName: returns unknown when attribute absent", () => {
  const el = {
    getAttribute: () => null,
  } as unknown as Element;

  assertEquals(getIslandName(el), "unknown");
});

Deno.test("getIslandName: returns unknown when getAttribute is not a function", () => {
  const el = { getAttribute: "not a function" } as unknown as Element;

  assertEquals(getIslandName(el), "unknown");
});

Deno.test("HydrationError: has correct name and reason", () => {
  const err = new HydrationError("test message", { code: 42 });
  assertEquals(err.name, "HydrationError");
  assertEquals(err.message, "test message");
  assertEquals(err.reason, { code: 42 });
});

Deno.test("RenderError: has correct name and reason", () => {
  const err = new RenderError("test message", { code: 42 });
  assertEquals(err.name, "RenderError");
  assertEquals(err.message, "test message");
  assertEquals(err.reason, { code: 42 });
});

Deno.test("IslandErrorEvent: is a CustomEvent with correct detail", () => {
  const event = new IslandErrorEvent({
    error: new Error("oops") as Error,
    island: "Counter",
  });
  assertEquals(event.type, "island-error");
  assertEquals(event.detail.error.message, "oops");
  assertEquals(event.detail.island, "Counter");
  assertEquals(event.bubbles, true);
});

Deno.test("IslandErrorEvent: accepts a non-Error value as error field", () => {
  // The interface requires Error, but runtime code may pass non-Error values.
  // Verify the event is still constructed and the detail is accessible.
  const event = new IslandErrorEvent({
    // deno-lint-ignore no-explicit-any
    error: "not an Error" as any,
    island: "Counter",
  });
  assertEquals(event.type, "island-error");
  assertEquals(event.detail.island, "Counter");
  assertEquals(event.bubbles, true);
});
