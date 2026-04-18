// hydrator_test.ts - Tests for Island SSR wrapper
import { assertEquals } from "@std/assert";
import { Island } from "./hydrator.ts";

// Minimal test component
function TestComponent(props: { name: string; count: number }) {
  return `<div>Hello ${props.name}, count: ${props.count}</div>`;
}

// Use the Island component (note: renders to string, not JSX nodes)
const result = Island({
  name: "TestComponent",
  component: TestComponent as unknown as import("@hono/hono/jsx").FC<
    Record<string, unknown>
  >,
  props: { name: "world", count: 42 },
  strategy: "immediate",
});

Deno.test("Island: renders data-island attribute", () => {
  const html = String(result);
  assertEquals(html.includes('data-island="TestComponent"'), true);
});

Deno.test("Island: renders data-props attribute", () => {
  const html = String(result);
  assertEquals(html.includes("data-props="), true);
});

Deno.test("Island: renders data-strategy attribute", () => {
  const html = String(result);
  assertEquals(html.includes('data-strategy="immediate"'), true);
});

Deno.test("Island: renders data-key attribute", () => {
  const html = String(result);
  assertEquals(html.includes("data-key="), true);
});

Deno.test("Island: SSR output is present", () => {
  const html = String(result);
  assertEquals(html.includes("Hello world, count: 42"), true);
});

Deno.test("Island: data-key is deterministic for same props", () => {
  const result1 = Island({
    name: "Counter",
    component: TestComponent as unknown as import("@hono/hono/jsx").FC<
      Record<string, unknown>
    >,
    props: { name: "x", count: 1 },
    strategy: "idle",
  });
  const result2 = Island({
    name: "Counter",
    component: TestComponent as unknown as import("@hono/hono/jsx").FC<
      Record<string, unknown>
    >,
    props: { name: "x", count: 1 },
    strategy: "idle",
  });
  // Same name+props should produce same key
  const key1 = String(result1).match(/data-key="([^"]+)"/)?.[1];
  const key2 = String(result2).match(/data-key="([^"]+)"/)?.[1];
  assertEquals(key1, key2);
});
