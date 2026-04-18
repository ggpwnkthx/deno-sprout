// lib/mount.ts
// This file runs in the BROWSER. No Deno APIs. No Node APIs.
// Imports must be bundled by sprout-build / sprout-dev.

/// <reference lib="dom" />
import { renderToString } from "@hono/hono/jsx/dom/server";
import type { FC } from "@hono/hono/jsx";

/**
 * Render a JSX island component into a DOM element using innerHTML.
 *
 * ## Rendering model (0.1.0)
 *
 * Hono's JSX runtime is string-serialisation-first - it has no DOM reconciler.
 * For 0.1.0, island hydration therefore uses a **full innerHTML replacement**:
 *   1. Call `Component(props)` to get a JSX node.
 *   2. Serialise to an HTML string via `renderToString`.
 *   3. Set `el.innerHTML` once.
 *
 * Signal-driven incremental DOM updates are **not automatic** in 0.1.0.
 * Island components that need reactivity must manage DOM mutations directly via
 * `useEffect` + `el.querySelector(…).textContent = …` or equivalent imperative
 * DOM calls. A real incremental renderer is a Phase 5 item.
 *
 * @param Component  The island's JSX functional component.
 * @param props      Deserialised props from the `data-props` attribute.
 * @param el         The container element (`[data-island]` div).
 * @returns          A dispose function. Currently a no-op; reserved for future
 *                   cleanup of effects registered by the component.
 */
export async function mount<P extends Record<string, unknown>>(
  Component: FC<P>,
  props: P,
  el: Element,
): Promise<() => void> {
  try {
    const html = await renderToString(Component(props));
    el.innerHTML = html;
  } catch (err) {
    console.error("[sprout] Failed to hydrate island:", err);
  }
  return () => {}; // dispose - no-op in 0.1.0
}
