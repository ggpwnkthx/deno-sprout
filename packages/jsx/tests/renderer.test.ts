import { assertEquals } from "@std/assert";
import { createJsxRenderer } from "../renderer.ts";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";

Deno.test("createJsxRenderer returns a middleware handler", () => {
  const handler = createJsxRenderer();
  assertEquals(typeof handler, "function");
  // Middleware handler takes (c, next)
  assertEquals(handler.length, 2);
});

Deno.test("createJsxRenderer accepts optional layout", () => {
  const layout: LayoutComponent = ({ children }) => children;
  const handler = createJsxRenderer(layout);
  assertEquals(typeof handler, "function");
});

Deno.test("createJsxRenderer works without layout", () => {
  const handler = createJsxRenderer();
  assertEquals(typeof handler, "function");
  // Calling with no layout should still work
});
