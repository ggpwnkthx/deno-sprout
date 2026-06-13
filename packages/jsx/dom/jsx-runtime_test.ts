// Tests for the browser DOM JSX runtime. The DOM runtime returns
// "dev" node objects that the Hono `render` function understands;
// they do not stringify to HTML. We assert on the object shape and
// leave the real DOM rendering path to `mount_component_test.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import { Fragment, jsx, jsxs } from "./jsx-runtime.ts";

interface DomDevNode {
  readonly tag: string | ((props: Record<string, unknown>) => unknown);
  readonly type: string | ((props: Record<string, unknown>) => unknown);
  readonly props: Record<string, unknown>;
  readonly key?: string;
}

function devNode(value: unknown): DomDevNode {
  return value as DomDevNode;
}

Deno.test("jsx on an intrinsic tag returns a dev node with the tag, props, and children", () => {
  const node = devNode(jsx("div", { id: "x", children: "hi" }));
  assertEquals(node.tag, "div");
  assertEquals(node.type, "div");
  assertEquals(node.props.id, "x");
  assertEquals(node.props.children, "hi");
});

Deno.test("jsx on a function component returns a dev node with the function as tag", () => {
  function Greeting({ name }: { name: string }) {
    return jsx("p", { class: "g", children: `hello ${name}` });
  }
  const node = devNode(jsx(Greeting, { name: "world" }));
  assertEquals(typeof node.tag, "function");
  assertEquals(typeof node.type, "function");
  assertEquals(node.props.name, "world");
});

Deno.test("jsxs is exported and accepts the same shape as jsx", () => {
  const node = devNode(jsxs("span", { class: "k", children: "ok" }));
  assertEquals(node.tag, "span");
  assertEquals(node.props.class, "k");
  assertEquals(node.props.children, "ok");
});

Deno.test("Fragment is exported and resolves to a fragment-shaped node", () => {
  const node = devNode(jsx(Fragment, { children: ["a", "b"] }));
  // Hono's DOM Fragment is a function whose rendered output is a
  // node with tag = "". We assert on the function and on the
  // children passthrough.
  assertEquals(typeof node.tag, "function");
  assertEquals(node.props.children, ["a", "b"]);
});

Deno.test("String(jsx(...)) returns a string for the dev node shape", () => {
  // The dev shape is not a real `JSXNode` and so does not have a
  // custom toString; this test documents the boundary. We assert
  // that String() returns a string of length > 0 — i.e. the call
  // does not throw and yields a value usable as a fallback.
  const node = jsx("div", { id: "x", children: "hi" });
  const s = String(node);
  assertEquals(typeof s, "string");
  if (s.length === 0) {
    throw new Error("expected non-empty string from String(jsx(...))");
  }
});
