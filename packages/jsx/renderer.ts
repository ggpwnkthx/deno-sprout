// renderer.ts - JSX rendering with layout support
import { jsxRenderer as honoJsxRenderer } from "@hono/hono/jsx-renderer";
import { Fragment, memo } from "@hono/hono/jsx";
import type { MiddlewareHandler } from "@hono/hono";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";

export function jsxRenderer(
  layout?: LayoutComponent,
): MiddlewareHandler {
  return honoJsxRenderer(({ children }) => {
    if (layout) {
      return layout({ children });
    }
    return children;
  });
}

export { Fragment, memo };
