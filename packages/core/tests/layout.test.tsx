// @jsxImportSource @hono/hono
import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  defineLayout,
  type LayoutComponent,
} from "@ggpwnkthx/sprout-core/lib/layout";

Deno.test("defineLayout returns the same component", () => {
  const layout: LayoutComponent = ({ children }) => (
    <section>{children}</section>
  );
  const result = defineLayout(layout);
  assertStrictEquals(result, layout);
});

Deno.test("defineLayout preserves component identity across multiple calls", () => {
  const layout: LayoutComponent = ({ children }) => <>{children}</>;
  const first = defineLayout(layout);
  const second = defineLayout(layout);
  assertStrictEquals(first, second);
  assertStrictEquals(first, layout);
});

Deno.test("defineLayout component can be used as layout props", () => {
  const layout: LayoutComponent = ({ children }) => (
    <div class="layout">{children}</div>
  );
  const wrapped = defineLayout(layout);
  // Calling the layout with children produces a JSX element
  const result = wrapped({ children: <span>inner</span> });
  assertEquals(result !== null, true);
});
