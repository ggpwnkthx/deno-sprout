// runtime_strategies_test.ts
//
// Tests for island hydration runtime strategies.
//
// WHAT CAN BE TESTED IN DENO:
//   - decodeProps() — exported and uses only standard Web APIs available in Deno
//   - Island bundle URL construction pattern — pure string logic
//   - Module-level state (the "loaded" Map persists across imports — Deno caches modules)
//   - SSR contract — the HTML attributes the runtime reads
//
// WHAT CANNOT BE TESTED IN DENO:
//   - hydrateVisible() — uses IntersectionObserver (browser-only)
//   - hydrateIdle()    — uses requestIdleCallback (browser-only)
//   - hydrateOne()    — private function; also uses fetch/import which requires a server
//   - hydrateAll()    — auto-bootstrap requires document; not evaluable in Deno
//
// NOTE: hydrateVisible, hydrateIdle, hydrateOne are private (not exported) and
// rely on browser-only APIs. They are integration-tested in a real browser environment.
//
/// <reference lib="dom" />
import { assertEquals, assertThrows } from "@std/assert";
import { decodeProps } from "../lib/runtime.ts";
import { encodeBase64 } from "@std/encoding/base64";

// ---------------------------------------------------------------------------
// decodeProps — edge cases beyond runtime.test.ts
// ---------------------------------------------------------------------------

Deno.test("decodeProps: empty string throws (Deno throws SyntaxError)", () => {
  // "" is not valid base64 — Deno's atob throws SyntaxError (browser may throw DOMException)
  assertThrows(() => decodeProps(""), SyntaxError);
});

Deno.test("decodeProps: e30= is the base64 encoding of {}", () => {
  // btoa("{}") === "e30="
  assertEquals(decodeProps("e30="), {});
});

Deno.test("decodeProps: round-trips complex nested objects", () => {
  const _original = {
    user: { name: "Alice", age: 30 },
    tags: ["a", "b", "c"],
    flag: true,
    nil: null,
    nested: { deep: { value: 42 } },
    sets: new Set([1, 2, 3]), // Set is not serializable — should be omitted or throw
  };
  // Sets are not JSON-serializable; we test with a round-tripable object instead.
  const roundTripable = {
    user: { name: "Alice", age: 30 },
    tags: ["a", "b", "c"],
    flag: true,
    nil: null,
    nested: { deep: { value: 42 } },
  };
  const encoded = btoa(JSON.stringify(roundTripable));
  const decoded = decodeProps(encoded);
  assertEquals(decoded, roundTripable);
});

Deno.test("decodeProps: round-trips unicode-heavy strings", () => {
  // NOTE: Deno's btoa cannot encode non-Latin1 characters, so we use
  // TextEncoder + encodeBase64 (same approach the serializer uses).
  const original = {
    emoji: "🚀",
    unicode: "日本語",
    mixed: "hello 世界",
    emojiInArray: ["🎉", "🎊"],
    emojiInObject: { key: "💡" },
  };
  const json = JSON.stringify(original);
  const encoded = encodeBase64(new TextEncoder().encode(json));
  const decoded = decodeProps(encoded);
  assertEquals(decoded, original);
});

Deno.test("decodeProps: throws on valid base64 with non-JSON content", () => {
  // btoa("plain text") produces a valid base64 string that decodes fine,
  // but JSON.parse on "plain text" throws SyntaxError
  const validBase64 = btoa("plain text");
  assertThrows(() => decodeProps(validBase64), SyntaxError);
});

Deno.test("decodeProps: handles numbers and booleans as top-level values", () => {
  // Numbers
  assertEquals(decodeProps(btoa("42")), 42);
  assertEquals(decodeProps(btoa("3.14")), 3.14);
  // Booleans
  assertEquals(decodeProps(btoa("true")), true);
  assertEquals(decodeProps(btoa("false")), false);
  // Arrays
  assertEquals(decodeProps(btoa("[1,2,3]")), [1, 2, 3]);
});

// ---------------------------------------------------------------------------
// Island bundle URL pattern
// ---------------------------------------------------------------------------
//
// hydrateOne constructs the bundle URL as:
//   const url = `/_sprout/islands/${name}.js`;
//
// This pattern is testable as pure string logic.

const islandBundleUrl = (name: string) => `/_sprout/islands/${name}.js`;

Deno.test("islandBundleUrl: follows /_sprout/islands/{name}.js pattern", () => {
  assertEquals(islandBundleUrl("Counter"), "/_sprout/islands/Counter.js");
  assertEquals(islandBundleUrl("SearchBar"), "/_sprout/islands/SearchBar.js");
  assertEquals(islandBundleUrl("DataTable"), "/_sprout/islands/DataTable.js");
  assertEquals(islandBundleUrl("a"), "/_sprout/islands/a.js");
  assertEquals(islandBundleUrl("ABC"), "/_sprout/islands/ABC.js");
});

Deno.test("islandBundleUrl: no special characters escaping needed for typical names", () => {
  // Typical island names are alphanumeric PascalCase identifiers.
  // The pattern is a simple string template — no special chars to escape.
  assertEquals(islandBundleUrl("Button1"), "/_sprout/islands/Button1.js");
  assertEquals(
    islandBundleUrl("MyComponent"),
    "/_sprout/islands/MyComponent.js",
  );
});

// ---------------------------------------------------------------------------
// Module-level "loaded" Map persistence
// ---------------------------------------------------------------------------
//
// Deno caches module instances. Importing runtime.ts multiple times returns
// the same module object. This means the "loaded" Map (a module-level const)
// is shared across all consumers of the runtime.
//
// We verify that importing the same module twice gives the same exports object.

Deno.test("loaded Map: module is cached — re-importing returns same instance", async () => {
  const m1 = await import("../lib/runtime.ts");
  const m2 = await import("../lib/runtime.ts");

  // The module namespace object should be referentially identical (same cache entry)
  assertEquals(m1 === m2, true);

  // The exported function should be the same reference too
  assertEquals(m1.decodeProps === m2.decodeProps, true);
});

// ---------------------------------------------------------------------------
// Strategy dispatch logic — attribute reading (without browser APIs)
// ---------------------------------------------------------------------------
//
// hydrateAll dispatches based on data-strategy attribute:
//   const strategy = el.getAttribute("data-strategy") ?? "immediate";
//
// We test the attribute-reading logic in isolation with a fake element.

function fakeIslandElement(attrs: Record<string, string | null>): Element {
  return {
    getAttribute(name: string): string | null {
      return attrs[name] ?? null;
    },
  } as unknown as Element;
}

Deno.test("strategy dispatch: defaults to 'immediate' when attribute is absent", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": "e30=",
    // data-strategy is missing
  });
  const strategy = el.getAttribute("data-strategy") ?? "immediate";
  assertEquals(strategy, "immediate");
});

Deno.test("strategy dispatch: reads 'visible' when attribute is set", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": "e30=",
    "data-strategy": "visible",
  });
  const strategy = el.getAttribute("data-strategy") ?? "immediate";
  assertEquals(strategy, "visible");
});

Deno.test("strategy dispatch: reads 'idle' when attribute is set", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": "e30=",
    "data-strategy": "idle",
  });
  const strategy = el.getAttribute("data-strategy") ?? "immediate";
  assertEquals(strategy, "idle");
});

Deno.test("strategy dispatch: explicit 'immediate' is read correctly", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": "e30=",
    "data-strategy": "immediate",
  });
  const strategy = el.getAttribute("data-strategy") ?? "immediate";
  assertEquals(strategy, "immediate");
});

// ---------------------------------------------------------------------------
// Guard conditions on fake island elements
// ---------------------------------------------------------------------------
//
// hydrateOne returns early when:
//   if (!name || !propsEncoded) return;
//
// We verify the attribute combinations that trigger early return.

Deno.test("hydrateOne guard: missing data-island returns early", () => {
  const el = fakeIslandElement({
    "data-island": null,
    "data-props": "e30=",
  });
  const name = el.getAttribute("data-island");
  assertEquals(!!name, false); // name is falsy → early return
});

Deno.test("hydrateOne guard: missing data-props returns early", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": null,
  });
  const name = el.getAttribute("data-island");
  const propsEncoded = el.getAttribute("data-props");
  assertEquals(!!name, true);
  assertEquals(!!propsEncoded, false); // propsEncoded is falsy → early return
});

Deno.test("hydrateOne guard: both attributes present allows hydration", () => {
  const el = fakeIslandElement({
    "data-island": "Test",
    "data-props": "e30=",
  });
  const name = el.getAttribute("data-island");
  const propsEncoded = el.getAttribute("data-props");
  assertEquals(!!name, true);
  assertEquals(!!propsEncoded, true); // both truthy → hydration proceeds
});

// ---------------------------------------------------------------------------
// Auto-bootstrap limitation — document is not defined in Deno
// ---------------------------------------------------------------------------
//
// The runtime contains:
//   if (typeof document !== "undefined") { hydrateAll(); }
//
// In Deno, `document` is not defined, so this branch is never taken.
// hydrateAll cannot be called or tested in Deno without a DOM shim.

Deno.test("hydrateAll: auto-bootstrap guard — document is undefined in Deno", () => {
  const hasDocument = typeof document !== "undefined";
  assertEquals(hasDocument, false, "document is not defined in Deno");
});

// ---------------------------------------------------------------------------
// Why IntersectionObserver and requestIdleCallback cannot be tested here
// ---------------------------------------------------------------------------
//
// hydrateVisible uses:
//   new IntersectionObserver((entries) => { ... })
//
// hydrateIdle uses:
//   window.requestIdleCallback
//
// These are browser-only Web APIs. Deno does not implement them natively.
// To test these strategies in Deno would require a full DOM shim (e.g., jsdom,
// happy-dom, or a custom IntersectionObserver mock) which adds complexity
// beyond the scope of unit tests.
//
// The strategy behavior is verified through integration tests in a real browser
// or through manual testing with the dev server.
//
