// Tests for the server JSX runtime: placeholder emission, registry
// hooks, and invalid src rejection.
import {
  assertEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { Fragment, jsx } from "./jsx-runtime.ts";
import { registerIslandComponent } from "./island-registry.ts";
import { RuntimeError } from "../shared/mod.ts";
import type { IslandMetadata } from "./island-registry.ts";
import type { JSXNode } from "@hono/hono/jsx";

// Helper: build an `IslandMetadata` from a free-form src so tests can
// exercise the runtime validation without the template literal type
// rejecting the input at compile time.
function meta(src: string, id?: string): IslandMetadata {
  return { id: id ?? "X", src: src as IslandMetadata["src"] };
}

Deno.test("unregistered function component renders normally", () => {
  function Greeting({ name }: { name: string }) {
    return jsx("span", null, `hello ${name}`);
  }
  const node = jsx(Greeting, { name: "world" }) as JSXNode;
  // Greeting returns a `span`; the rendered output should include the
  // text "hello world" and the span tag. We assert on the `toString`
  // representation because Hono's JSXNode is lazy.
  const html = String(node);
  assertStringIncludes(html, "<span");
  assertStringIncludes(html, "hello world");
});

Deno.test("registered island component emits a placeholder div with the three data-sprout-* attributes", () => {
  function Counter({ initial }: { initial: number }) {
    // This function body must NOT execute when the component is
    // registered as an island. We assert that by checking that the
    // rendered HTML does NOT contain the component's normal output.
    return jsx("span", null, `counter: ${initial}`);
  }
  registerIslandComponent(Counter, {
    id: "Counter",
    src: "/@sprout/island/Counter.js",
  });
  const node = jsx(Counter, { initial: 1 }) as JSXNode;
  const html = String(node);
  assertStringIncludes(html, "<div");
  assertStringIncludes(html, 'data-sprout-island="Counter"');
  assertStringIncludes(html, 'data-sprout-src="/@sprout/island/Counter.js"');
  // Props must be JSON-serialized in `data-sprout-props`.
  assertStringIncludes(html, "data-sprout-props=");
  // The body of the component must not have run.
  if (html.includes("counter: 1")) {
    throw new Error("registered component body should not have executed on the server");
  }
  // Sanity: no runtime-managed attributes on the server.
  if (html.includes("data-sprout-mounted")) {
    throw new Error("server must not emit data-sprout-mounted");
  }
  if (html.includes("data-sprout-error")) {
    throw new Error("server must not emit data-sprout-error");
  }
});

Deno.test("placeholder props are JSON-serializable and round-trip through parseJsonProps", () => {
  function Island() {
    return null;
  }
  registerIslandComponent(Island, {
    id: "Island",
    src: "/@sprout/island/Island.js",
  });
  const node = jsx(Island, { count: 3, items: ["a", "b"], meta: { ok: true } }) as JSXNode;
  const html = String(node);
  // Pull the attribute out of the rendered HTML.
  const match = html.match(/data-sprout-props="([^"]*)"/);
  if (!match) throw new Error("data-sprout-props attribute missing");
  const inner = match[1];
  if (inner === undefined) throw new Error("data-sprout-props capture missing");
  // The attribute value is HTML-escaped; Hono escapes the inner quotes
  // and the JSON value. Decode the common HTML entities for a parse
  // round-trip check.
  const decoded = inner
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  const parsed = JSON.parse(decoded) as Record<string, unknown>;
  assertEquals(parsed.count, 3);
  assertEquals(parsed.items, ["a", "b"]);
  assertEquals((parsed.meta as Record<string, unknown>).ok, true);
});

Deno.test("Fragment is exported and renders children", () => {
  const node = jsx(Fragment, null, "a", "b") as JSXNode;
  const html = String(node);
  assertStringIncludes(html, "a");
  assertStringIncludes(html, "b");
});

Deno.test("registerIslandComponent rejects src that escapes the prefix", () => {
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/../escape.js")),
    RuntimeError,
    "canonical",
  );
});

Deno.test("registerIslandComponent rejects src with a non-canonical scheme", () => {
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("http://evil.example/x.js")),
    RuntimeError,
    "canonical",
  );
});

Deno.test("registerIslandComponent rejects src missing the .js extension", () => {
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/island/Counter")),
    RuntimeError,
    "canonical",
  );
});

Deno.test("registerIslandComponent rejects src with a NUL byte", () => {
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/island/Co\u0000unter.js")),
    RuntimeError,
    "canonical",
  );
});

Deno.test("registerIslandComponent throws when id does not match src", () => {
  function Comp() {
    return null;
  }
  // src says "Other" but declared id is "Counter" — mismatch.
  assertThrows(
    () =>
      registerIslandComponent(Comp, {
        id: "Counter",
        src: "/@sprout/island/Other.js",
      }),
    RuntimeError,
    "does not match",
  );
});

Deno.test("registerIslandComponent throws for non-function component value", () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => registerIslandComponent({} as any, meta("/@sprout/island/Counter.js")),
    RuntimeError,
    "must be a function",
  );
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => registerIslandComponent([] as any, meta("/@sprout/island/Counter.js")),
    RuntimeError,
    "must be a function",
  );
});

Deno.test("island children are discarded (placeholder replaces the tree)", () => {
  function Parent() {
    return jsx("div", null, "this is discarded");
  }
  registerIslandComponent(Parent, {
    id: "Parent",
    src: "/@sprout/island/Parent.js",
  });
  const node = jsx(Parent, null, jsx("span", null, "never rendered")) as JSXNode;
  const html = String(node);
  // The placeholder div must be present.
  assertStringIncludes(html, "<div");
  assertStringIncludes(html, 'data-sprout-island="Parent"');
  // The children passed to the island must NOT appear in the output.
  if (html.includes("never rendered")) {
    throw new Error("island children should not appear in server output");
  }
});

Deno.test("distinct function references are separate registry entries", () => {
  // This test verifies the WeakMap-keyed behavior: two function references
  // are independent keys even if they have the same source text.
  function A() {
    return jsx("span", null, "A");
  }
  function B() {
    return jsx("span", null, "B");
  }
  registerIslandComponent(A, { id: "A", src: "/@sprout/island/A.js" });
  registerIslandComponent(B, { id: "B", src: "/@sprout/island/B.js" });
  // Both resolve to their respective island metadata.
  const htmlA = String(jsx(A, null));
  const htmlB = String(jsx(B, null));
  assertStringIncludes(htmlA, 'data-sprout-island="A"');
  assertStringIncludes(htmlB, 'data-sprout-island="B"');
});

Deno.test("invalid props throw INVALID_PROPS through the placeholder path", () => {
  function Comp() {
    return null;
  }
  registerIslandComponent(Comp, {
    id: "Comp",
    src: "/@sprout/island/Comp.js",
  });
  let caught: unknown;
  try {
    jsx(Comp, { fn: () => 1 });
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "INVALID_PROPS");
});
