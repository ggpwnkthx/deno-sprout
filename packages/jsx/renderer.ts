// renderer.ts - JSX rendering with layout support
import { jsxRenderer as honoJsxRenderer } from "@hono/hono/jsx-renderer";
import type { HtmlEscapedString } from "@hono/hono/utils/html";
import { Fragment, memo } from "@hono/hono/jsx";
import type { MiddlewareHandler } from "@hono/hono";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";

export function createJsxRenderer(
  layout?: LayoutComponent,
): MiddlewareHandler {
  return honoJsxRenderer(
    ({ children }): HtmlEscapedString | Promise<HtmlEscapedString> => {
      if (layout) {
        return layout({ children }) as HtmlEscapedString;
      }
      return children as HtmlEscapedString;
    },
  );
}

export { Fragment, memo };
