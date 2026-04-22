/**
 * @fileoverview Browser-compatible JSX string rendering and island hydration utilities.
 *
 * These functions run exclusively in the browser. They are bundled by
 * `sprout-build` or `sprout-dev` and included in island runtime code.
 *
 * @module
 */

import type { FC } from "@hono/hono/jsx";

/**
 * Error thrown when a JSX component cannot be rendered to a string.
 */
export class RenderError extends Error {
  constructor(message: string, public reason?: unknown) {
    super(message);
    this.name = "RenderError";
  }
}

/**
 * Error thrown when island hydration fails.
 */
export class HydrationError extends Error {
  constructor(message: string, public reason?: unknown) {
    super(message);
    this.name = "HydrationError";
  }
}

/**
 * Detail payload for the `island-error` CustomEvent.
 *
 * @example
 * ```ts
 * document.addEventListener("island-error", (e: IslandErrorEvent) => {
 *   console.error(e.detail.island, e.detail.error.message);
 * });
 * ```
 */
export interface IslandErrorDetail {
  /** The error that caused the hydration failure. */
  error: Error;
  /** The island name, or `"unknown"` if the name could not be determined. */
  island: string;
}

/**
 * Typed custom event dispatched on an island element when hydration fails.
 * Extends `CustomEvent` with the {@link IslandErrorDetail} detail type.
 */
export class IslandErrorEvent extends CustomEvent<IslandErrorDetail> {
  constructor(detail: IslandErrorDetail) {
    super("island-error", { detail, bubbles: true });
  }
}

/**
 * Validates that a value is a suitable props object for an island component.
 *
 * Checks that the value is a non-null object (i.e., a plain object or array).
 * This is a shallow check; it does not validate individual prop types.
 *
 * @param props - The value to validate
 * @returns `true` if props is a non-null object, `false` otherwise
 */
export function validateProps(props: unknown): boolean {
  return typeof props === "object" && props !== null;
}

/**
 * Safely extracts the island name from an element for error reporting.
 * Returns `"unknown"` when the attribute is unavailable or absent.
 * Guards against plain object mocks used in tests.
 */
export function getIslandName(el: Element): string {
  if (typeof el.getAttribute !== "function") return "unknown";
  return el.getAttribute("data-island") ?? "unknown";
}

/**
 * Renders a JSX component to its HTML string representation.
 *
 * This is a browser-compatible inline implementation that delegates to
 * the component's built-in `toString()` method, which Hono's JSX compiler
 * ensures returns the serialized HTML. This avoids depending on
 * `@hono/hono/jsx/dom/server`, which is Node.js-only.
 *
 * @param component - The result of calling a JSX functional component,
 *   i.e. a JSX node with a `toString()` method.
 * @returns The rendered HTML string.
 * @throws {RenderError} If `component` is null/undefined, or if it is an
 *   async component (which is not supported by this synchronous renderer).
 */
export function renderToString(component: ReturnType<FC>): string {
  if (component == null) {
    throw new RenderError("Component returned null or undefined");
  }
  let result: string;
  try {
    result = component.toString();
  } catch (err) {
    throw new RenderError(
      "Component.toString() threw during renderToString",
      err,
    );
  }
  if (typeof result !== "string") {
    throw new RenderError("Async component is not supported in renderToString");
  }
  return result;
}
