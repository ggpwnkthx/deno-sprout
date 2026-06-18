// Tests for `mountComponent` with a fake DOM element and an injected
// render function. The fake render function is the seam that lets
// these tests run without standing up a real DOM.
import { assertEquals, assertInstanceOf, assertStringIncludes } from "jsr:@std/assert@1";
import { clearElement, mountComponent } from "./mount_component.ts";
import type { DomRender } from "./mount_component.ts";
import { jsx } from "@sprout/jsx/dom";
import { asElement, makeElement } from "./_test_utils.ts";
import { RuntimeError } from "./errors.ts";

/**
 * Minimal "render" that just calls the function component with its
 * props. The runtime does not depend on a real DOM; the test seam
 * here is what the real `Hono render` would do for a function tag.
 */
// deno-lint-ignore no-explicit-any
function invokeRender(node: any, _container: HTMLElement): void {
  if (typeof node?.tag === "function") {
    node.tag(node.props);
  }
}

Deno.test("clearElement removes all children from a placeholder", () => {
  const el = makeElement();
  el.appendChild(makeElement());
  el.appendChild(makeElement());
  assertEquals(el.children.length, 2);
  clearElement(asElement(el));
  assertEquals(el.children.length, 0);
});

Deno.test("mountComponent clears the element, renders, and marks mounted", () => {
  const el = makeElement();
  // Stale content that the runtime must clear before rendering.
  el.appendChild(makeElement());
  el.appendChild(makeElement());

  let renderCalls = 0;
  const fakeRender: DomRender = (_node, container) => {
    renderCalls++;
    // The element must have been cleared before render is invoked.
    assertEquals(container.children.length, 0);
  };

  function Hello(_props: { name: string }): unknown {
    return jsx("p", { class: "g", children: "hi" });
  }

  mountComponent(asElement(el), Hello, { name: "world" }, fakeRender);
  assertEquals(renderCalls, 1);
  assertEquals(el.getAttribute("data-sprout-mounted"), "true");
});

Deno.test("mountComponent does not mark mounted when render throws", () => {
  const el = makeElement();
  const failRender: DomRender = () => {
    throw new Error("dom unavailable");
  };
  function Bad() {
    return null;
  }
  let caught: unknown;
  try {
    mountComponent(asElement(el), Bad, {}, failRender);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "MOUNT_FAILED");
  assertStringIncludes(caught.message, "dom unavailable");
  assertEquals(el.getAttribute("data-sprout-mounted"), null);
});

Deno.test("mountComponent wraps a component that throws during render as MOUNT_FAILED", () => {
  const el = makeElement();
  function Bad(): unknown {
    throw new Error("nope");
  }
  // The injected render invokes the component to mirror the Hono
  // renderer, so the throw surfaces inside the runtime's try/catch.
  let caught: unknown;
  try {
    mountComponent(asElement(el), Bad, {}, invokeRender);
  } catch (e) {
    caught = e;
  }
  assertInstanceOf(caught, RuntimeError);
  assertEquals(caught.code, "MOUNT_FAILED");
  assertStringIncludes(caught.message, "nope");
  assertEquals(el.getAttribute("data-sprout-mounted"), null);
});
