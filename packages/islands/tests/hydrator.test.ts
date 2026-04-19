// hydrator_test.ts - Tests for Island SSR wrapper
import { assertEquals, assertNotEquals } from "@std/assert";
import { Island, simpleHash } from "../hydrator.ts";
import { deserializeProps } from "../serializer.ts";

type FC<T> = import("@hono/hono/jsx").FC<T>;

// Minimal test component
function TestComponent(props: { name: string; count: number }) {
  return `<div>Hello ${props.name}, count: ${props.count}</div>`;
}

function renderIsland(
  name: string,
  props: Record<string, unknown>,
  strategy: "immediate" | "visible" | "idle" = "immediate",
): string {
  return String(
    Island({
      name,
      component: TestComponent as unknown as FC<Record<string, unknown>>,
      props,
      strategy,
    }),
  );
}

function extractAttr(html: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]+)"`);
  return html.match(re)?.[1] ?? null;
}

Deno.test("Island: renders data-island attribute", () => {
  const html = renderIsland("TestComponent", { name: "world", count: 42 });
  assertEquals(extractAttr(html, "data-island"), "TestComponent");
});

Deno.test("Island: data-props round-trips to original props", () => {
  const props = { name: "world", count: 42 };
  const html = renderIsland("TestComponent", props);
  const encoded = extractAttr(html, "data-props");
  assertEquals(encoded !== null, true);
  const deserialized = deserializeProps<typeof props>(encoded!);
  assertEquals(deserialized, props);
});

Deno.test("Island: data-strategy reflects strategy option", () => {
  assertEquals(
    extractAttr(renderIsland("X", {}, "immediate"), "data-strategy"),
    "immediate",
  );
  assertEquals(
    extractAttr(renderIsland("X", {}, "visible"), "data-strategy"),
    "visible",
  );
  assertEquals(
    extractAttr(renderIsland("X", {}, "idle"), "data-strategy"),
    "idle",
  );
});

Deno.test("Island: strategy defaults to immediate when omitted", () => {
  const html = String(
    Island({
      name: "TestComponent",
      component: TestComponent as unknown as FC<Record<string, unknown>>,
      props: { name: "world", count: 42 },
      // no strategy
    }),
  );
  assertEquals(extractAttr(html, "data-strategy"), "immediate");
});

Deno.test("Island: SSR output is present", () => {
  const html = renderIsland("TestComponent", { name: "world", count: 42 });
  assertEquals(html.includes("Hello world, count: 42"), true);
});

Deno.test("Island: data-key is deterministic for same name+props", () => {
  const html1 = renderIsland("Counter", { x: 1 }, "idle");
  const html2 = renderIsland("Counter", { x: 1 }, "idle");
  assertEquals(extractAttr(html1, "data-key"), extractAttr(html2, "data-key"));
});

Deno.test("Island: data-key differs when props differ", () => {
  const html1 = renderIsland("Counter", { x: 1 }, "idle");
  const html2 = renderIsland("Counter", { x: 2 }, "idle");
  assertEquals(
    extractAttr(html1, "data-key") !== extractAttr(html2, "data-key"),
    true,
  );
});

Deno.test("Island: data-key differs when name differs", () => {
  const html1 = renderIsland("Counter", { x: 1 }, "idle");
  const html2 = renderIsland("Other", { x: 1 }, "idle");
  assertEquals(
    extractAttr(html1, "data-key") !== extractAttr(html2, "data-key"),
    true,
  );
});

Deno.test("Island: data-key is stable across strategy changes", () => {
  // Key is based on name + props, not strategy
  const html1 = renderIsland("Counter", { x: 1 }, "immediate");
  const html2 = renderIsland("Counter", { x: 1 }, "idle");
  assertEquals(extractAttr(html1, "data-key"), extractAttr(html2, "data-key"));
});

// ---------------------------------------------------------------------------
// simpleHash distribution and collision resistance
// ---------------------------------------------------------------------------

Deno.test("simpleHash: is deterministic", () => {
  const h1 = simpleHash("hello world");
  const h2 = simpleHash("hello world");
  assertEquals(h1, h2);
});

Deno.test("simpleHash: differs for related strings (avoids trivial collisions)", () => {
  // Single-character edits
  assertNotEquals(simpleHash("hello"), simpleHash("helloo"));
  assertNotEquals(simpleHash("hello"), simpleHash("hella"));
  // Prefix additions
  assertNotEquals(simpleHash("Counter"), simpleHash("Counter1"));
  assertNotEquals(simpleHash("a"), simpleHash("ab"));
  assertNotEquals(simpleHash("ab"), simpleHash("abc"));
});

Deno.test("simpleHash: differs for similar prop objects", () => {
  const html1 = renderIsland("Counter", { x: 1, y: 0 }, "idle");
  const html2 = renderIsland("Counter", { x: 1, y: 1 }, "idle");
  assertNotEquals(
    extractAttr(html1, "data-key"),
    extractAttr(html2, "data-key"),
  );
});

Deno.test("simpleHash: hash length is bounded (short numeric string in base-36)", () => {
  // toString(36) produces short strings (max ~7 chars for 32-bit integers).
  // Verify the output is a reasonably short string for all input lengths.
  const short = simpleHash("a");
  const long = simpleHash("a".repeat(200));
  const med = simpleHash(
    "hello world this is a moderately long string for hashing",
  );
  // All should be short (base-36 representation of a 32-bit int)
  assertEquals(short.length <= 7, true);
  assertEquals(med.length <= 7, true);
  assertEquals(long.length <= 7, true);
});

Deno.test("simpleHash: is non-negative (Math.abs)", () => {
  // Test with a variety of strings; all results must be positive
  const inputs = [
    "a",
    "z",
    "aa",
    "az",
    "za",
    "zz",
    "hello",
    "world",
    "Counter",
    "SearchBar",
    "🚀", // emoji (multi-byte codepoint)
  ];
  for (const input of inputs) {
    const h = simpleHash(input);
    assertEquals(
      h.startsWith("-"),
      false,
      `Hash of "${input}" started with -: ${h}`,
    );
  }
});

Deno.test("simpleHash: same props string always produces same key in Island", () => {
  const props = { name: "Alice", count: 42, flag: true };
  const html1 = renderIsland("Counter", props, "idle");
  const html2 = renderIsland("Counter", props, "idle");
  assertEquals(extractAttr(html1, "data-key"), extractAttr(html2, "data-key"));
});
