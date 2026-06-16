// Tests for the server JSX runtime: placeholder emission, registry
// hooks, and invalid src rejection.
import {
  assertEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { Fragment, jsx } from "./jsx-runtime.ts";
import { clearIslandRegistry, registerIslandComponent } from "./island-registry.ts";
import { RuntimeError } from "../shared/mod.ts";
import type { IslandMetadata } from "./island-registry.ts";
import type { JSXNode } from "@hono/hono/jsx";

// Each test starts with a clean registry.
function reset(): void {
  clearIslandRegistry();
}

// Helper: build an `IslandMetadata` from a free-form src so tests can
// exercise the runtime validation without the template literal type
// rejecting the input at compile time.
function meta(src: string): IslandMetadata {
  return { id: "X", src: src as IslandMetadata["src"] };
}

Deno.test("unregistered function component renders normally", () => {
  reset();
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
  reset();
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
  reset();
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
  reset();
  const node = jsx(Fragment, null, "a", "b") as JSXNode;
  const html = String(node);
  assertStringIncludes(html, "a");
  assertStringIncludes(html, "b");
});

Deno.test("registerIslandComponent rejects src that escapes the prefix", () => {
  reset();
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/../escape.js")),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("registerIslandComponent rejects src with a non-canonical scheme", () => {
  reset();
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("http://evil.example/x.js")),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("registerIslandComponent rejects src missing the .js extension", () => {
  reset();
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/island/Counter")),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("registerIslandComponent rejects src with a NUL byte", () => {
  reset();
  function Comp() {
    return null;
  }
  assertThrows(
    () => registerIslandComponent(Comp, meta("/@sprout/island/Co\u0000unter.js")),
    RuntimeError,
    undefined,
    undefined,
  );
});

Deno.test("clearIslandRegistry empties the registry", () => {
  reset();
  function Comp() {
    return jsx("span", null, "real");
  }
  registerIslandComponent(Comp, {
    id: "Comp",
    src: "/@sprout/island/Comp.js",
  });
  // After clear, the component should render normally again.
  clearIslandRegistry();
  const node = jsx(Comp, null) as JSXNode;
  const html = String(node);
  assertStringIncludes(html, "<span");
  assertStringIncludes(html, "real");
});

Deno.test("invalid props throw INVALID_PROPS through the placeholder path", () => {
  reset();
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
