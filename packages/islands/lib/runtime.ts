/**
 * @fileoverview Client-side island hydration runtime.
 *
 * This file runs exclusively in the browser. It is bundled separately
 * and loaded as a startup script to hydrate island components.
 *
 * ## Responsibilities
 *
 * 1. Find all `<div data-island>` elements in the DOM
 * 2. Load each island's JavaScript bundle on demand
 * 3. Decode the serialized props from `data-props`
 * 4. Call the island's `mount(props, element)` function
 * 5. Respect each island's hydration {@link HydrationStrategy}
 *
 * ## Hydration strategies
 *
 * - **"immediate"** – hydrate right away (default)
 * - **"visible"**   – hydrate when the island enters the viewport
 * - **"idle"**      – hydrate during browser idle time
 *
 * ## Auto-bootstrap
 *
 * This module auto-bootstraps by listening to `DOMContentLoaded`.
 * If the DOM is already ready when this script runs, hydration starts immediately.
 *
 * ## Error handling
 *
 * Hydration errors are dispatched as bubbling `island-error` events
 * (typed as {@link IslandErrorEvent}) on the island element. Listeners can
 * observe failures without crashing the rest of the page. Unhandled errors
 * are also thrown for host awareness.
 */

import { IslandErrorEvent, validateProps } from "./stringify.ts";

/**
 * Map from island name to its loaded module factory.
 * Modules are fetched lazily and cached after first load.
 */
const loaded = new Map<
  string,
  { default: (props: unknown, el: Element) => void }
>();

/**
 * Base URL path for island bundles. Override by setting
 * `window.__SPROUT_ISLAND_BUNDLE_PREFIX__` before this script loads.
 */
const ISLAND_BUNDLE_PREFIX = (typeof window !== "undefined" &&
  (window as typeof window & { __SPROUT_ISLAND_BUNDLE_PREFIX__?: string })
    .__SPROUT_ISLAND_BUNDLE_PREFIX__) ||
  "/_sprout/islands/";

/**
 * Decodes and parses the `data-props` attribute value from an island div.
 *
 * The props are stored as base64-encoded JSON. This function:
 * 1. Decodes base64 to raw bytes
 * 2. Decodes bytes to a UTF-8 string
 * 3. Parses JSON to reconstruct the original props object
 *
 * @param encoded - Base64-encoded JSON string from `data-props`
 * @returns The decoded props object
 * @throws {TypeError} If the input is not valid base64 or JSON
 */
export function decodeProps(encoded: string): unknown {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch (e) {
    throw new TypeError(
      `Invalid base64 in data-props: ${e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Fetches and hydrates a single island element.
 *
 * 1. Reads the island name from `data-island`
 * 2. Reads the encoded props from `data-props`
 * 3. Fetches the island bundle from `/{prefix}/{name}.js`
 * 4. Calls the module's default export with props and the container element
 *
 * Bundles are cached after first load; subsequent hydrations of the same
 * island type reuse the cached module.
 *
 * @param el - The island container element with `data-island` and `data-props`
 * @throws {TypeError} If bundle fetch fails or props cannot be decoded
 */
async function hydrateOne(el: Element): Promise<void> {
  const name = el.getAttribute("data-island");
  const propsEncoded = el.getAttribute("data-props");
  if (!name || !propsEncoded) return;

  let module: { default: (props: unknown, el: Element) => void };
  if (loaded.has(name)) {
    module = loaded.get(name)!;
  } else {
    const url = `${ISLAND_BUNDLE_PREFIX}${name}.js`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = new TypeError(
        `Failed to fetch island bundle: ${url} (${res.status})`,
      );
      el.dispatchEvent(
        new IslandErrorEvent({ error: err, island: name ?? "unknown" }),
      );
      throw err;
    }
    const { default: mod } = await import(/* @vite-ignore */ url);
    module = { default: mod };
    loaded.set(name, module);
  }

  const props = decodeProps(propsEncoded);
  if (!validateProps(props)) {
    const err = new TypeError(
      "Malformed data-props: expected a non-null object",
    );
    el.dispatchEvent(
      new IslandErrorEvent({ error: err, island: name ?? "unknown" }),
    );
    return;
  }
  await module.default(props, el);
}

/**
 * Hydration strategy: hydrate immediately without delay.
 *
 * @param el - The island container element
 */
async function hydrateImmediate(el: Element): Promise<void> {
  await hydrateOne(el);
}

/**
 * Hydration strategy: hydrate when the island enters the viewport.
 *
 * Uses `IntersectionObserver` to detect when the element becomes visible.
 * The observer disconnects after the first intersection, so hydration
 * happens exactly once per island.
 *
 * @param el - The island container element
 */
async function hydrateVisible(el: Element): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          hydrateOne(el).then(resolve).catch(reject);
          break;
        }
      }
    });
    observer.observe(el);
  });
}

/**
 * Hydration strategy: hydrate during browser idle time.
 *
 * Uses `requestIdleCallback` if available, falling back to `setTimeout(0)`
 * for older browsers. This defers hydration until the main thread is free,
 * improving page load performance.
 *
 * @param el - The island container element
 */
async function hydrateIdle(el: Element): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cb = () => {
      (idleCallback as { disconnect?: () => void })?.disconnect?.();
      hydrateOne(el).then(resolve).catch(reject);
    };
    const rid = (window as typeof window & {
      requestIdleCallback: (cb: () => void) => number;
    }).requestIdleCallback;
    const idleCallback = rid ? rid(cb) : setTimeout(cb, 0);
  });
}

/**
 * Entry point: hydrates all islands on the page.
 *
 * Queries the DOM for all `[data-island]` elements, determines each
 * island's hydration strategy from `data-strategy`, and initiates
 * hydration according to that strategy. Returns a promise that resolves
 * when all islands have been hydrated.
 *
 * Errors from individual islands are dispatched as `island-error` events
 * on the respective island element. The promise rejects if any island
 * bundle fails to load; individual island failures that are caught by
 * their own error events do not cause the whole page to reject.
 *
 * This function is called automatically on `DOMContentLoaded`; you
 * should not need to call it directly unless you dynamically add
 * islands after page load.
 *
 * @returns A promise that resolves when all islands have been processed
 */
export async function hydrateAll(): Promise<void> {
  const islands = document.querySelectorAll<Element>("[data-island]");
  const strategies = Array.from(islands).map((el) => {
    const strategy = (el.getAttribute("data-strategy") ?? "immediate") as
      | "immediate"
      | "visible"
      | "idle";
    switch (strategy) {
      case "visible":
        return hydrateVisible(el);
      case "idle":
        return hydrateIdle(el);
      default:
        return hydrateImmediate(el);
    }
  });
  await Promise.all(strategies);
}

/**
 * Auto-bootstrap: starts hydration when the DOM is ready.
 *
 * Checks if `document` is defined (safe for SSR environments) and
 * whether the DOM has already been parsed. If `DOMContentLoaded` has
 * not yet fired, waits for it; otherwise hydrates immediately.
 */
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => hydrateAll());
  } else {
    hydrateAll();
  }
}
