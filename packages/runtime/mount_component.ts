// `mountComponent`: render a single component into a placeholder element.
//
// The runtime is responsible for clearing the placeholder, calling the
// DOM JSX renderer with the supplied component and props, and marking
// the element as mounted. Any error thrown by the component or the
// renderer is caught and re-thrown as a typed `RuntimeError` so callers
// can convert it into an `IslandMountResult` failure.
import { causeMessage } from "@sprout/utils/cause";
import { jsx, render } from "@sprout/jsx/dom";
import { RuntimeError } from "@sprout/jsx/shared";

/**
 * Render-function shape consumed by `mountComponent`. The default
 * implementation calls Hono's DOM `render`. Tests inject a fake to
 * exercise the runtime contract without standing up a real DOM.
 */
export type DomRender = (node: ReturnType<typeof jsx>, container: HTMLElement) => void;

/**
 * Default DOM render: Hono's `render(jsxNode, container)`.
 */
const defaultRender: DomRender = (node, container) => {
  render(node, container);
};

/**
 * Clear any children from a placeholder element. Exported for tests
 * that need to exercise the clearing behavior without invoking the
 * full mount path.
 */
export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Mount a single component into a placeholder element.
 *
 * Steps:
 *   1. Clear any children from the element.
 *   2. Build a DOM JSX node by calling `Component({ ...props })`.
 *   3. Render the node into the element with Hono's DOM renderer.
 *   4. Mark the element as mounted with `data-sprout-mounted="true"`.
 *
 * Errors are wrapped as `RuntimeError("MOUNT_FAILED", message, { ... })`.
 * The structured `cause` is preserved on the `Error.cause` chain.
 *
 * An optional `renderImpl` overrides the DOM render function. Tests
 * use this to assert on the contract without standing up a DOM.
 */
export function mountComponent<Props extends Record<string, unknown>>(
  element: HTMLElement,
  Component: (props: Readonly<Props>) => unknown,
  props: Readonly<Record<string, unknown>>,
  renderImpl: DomRender = defaultRender,
): void {
  clearElement(element);
  try {
    // The component is invoked with a single `props` argument; the
    // runtime spreads the parsed props into that argument.
    const node = jsx(
      Component as unknown as (props: Record<string, unknown>) => unknown,
      { ...props } as Record<string, unknown>,
    );
    renderImpl(node, element);
  } catch (cause) {
    throw new RuntimeError(
      "MOUNT_FAILED",
      `component mount failed: ${causeMessage(cause)}`,
      undefined,
      cause,
    );
  }
  element.setAttribute("data-sprout-mounted", "true");
}
