/**
 * JSX rendering with layout support for Hono.
 *
 * This module provides a JSX renderer middleware that wraps rendered children
 * in an optional layout component. It is built on top of `@hono/hono/jsx-renderer`.
 */
import { jsxRenderer as honoJsxRenderer } from "@hono/hono/jsx-renderer";
import type { HtmlEscapedString } from "@hono/hono/utils/html";
import { Fragment, memo } from "@hono/hono/jsx";
import type { MiddlewareHandler } from "@hono/hono";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";

/**
 * Error thrown when {@link createJsxRenderer} is called with an invalid layout.
 */
export class InvalidLayoutError extends TypeError {
  constructor() {
    super(
      "createJsxRenderer: layout must be a function or undefined; " +
        "got non-function value",
    );
    this.name = "InvalidLayoutError";
  }
}

/**
 * Creates a Hono middleware handler that renders JSX children and optionally
 * wraps them in a layout component.
 *
 * @param layout - An optional {@link LayoutComponent} that receives the
 *   rendered children as its `children` prop. When omitted, the children are
 *   returned directly without any wrapper.
 *
 * @returns A {@link MiddlewareHandler} that can be registered on a Hono app.
 *
 * @throws {InvalidLayoutError} If `layout` is defined but not a function.
 *
 * @example
 * ```ts
 * // Basic usage without a layout
 * app.use(createJsxRenderer());
 * ```
 *
 * @example
 * ```ts
 * // Wrap all rendered content in a root layout
 * const rootLayout: LayoutComponent = ({ children }) => (
 *   <html>
 *     <head><title>My App</title></head>
 *     <body>{children}</body>
 *   </html>
 * );
 *
 * app.use(createJsxRenderer(rootLayout));
 * ```
 */
export function createJsxRenderer(
  layout?: LayoutComponent,
): MiddlewareHandler {
  if (layout !== undefined && typeof layout !== "function") {
    throw new InvalidLayoutError();
  }

  return honoJsxRenderer(
    ({ children }): HtmlEscapedString | Promise<HtmlEscapedString> => {
      if (layout) {
        // The layout is typed to return Child, which Hono's renderer accepts.
        // We trust the LayoutComponent contract here; Hono will throw at
        // render time if the return value is not renderable.
        return layout({ children }) as HtmlEscapedString;
      }
      return children as HtmlEscapedString;
    },
  );
}

/**
 * A special JSX element that renders its children without any wrapping tag.
 *
 * Use `Fragment` to group multiple elements without introducing an extra DOM
 * node, for example when a component needs to return multiple sibling elements.
 *
 * @example
 * ```tsx
 * const Group = ({ left, right }) => (
 *   <Fragment>
 *     <LeftPanel>{left}</LeftPanel>
 *     <RightPanel>{right}</RightPanel>
 *   </Fragment>
 * );
 * ```
 */
export { Fragment, memo };
