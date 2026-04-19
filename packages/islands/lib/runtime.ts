// lib/runtime.ts
// This file runs in the browser. Keep it small.

/** Map from island name to its loaded module. Populated lazily. */
const loaded = new Map<
  string,
  { default: (props: unknown, el: Element) => void }
>();

/**
 * Decode and parse the data-props attribute.
 * Exported for testability; do not use in production browser code outside this bundle.
 */
export function decodeProps(encoded: string): unknown {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Fetch the island bundle from /_sprout/islands/{name}.js,
 * call module.default(props, containerElement).
 */
async function hydrateOne(el: Element): Promise<void> {
  const name = el.getAttribute("data-island");
  const propsEncoded = el.getAttribute("data-props");
  if (!name || !propsEncoded) return;

  let module: { default: (props: unknown, el: Element) => void };
  if (loaded.has(name)) {
    module = loaded.get(name)!;
  } else {
    const url = `/_sprout/islands/${name}.js`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[sprout] Failed to fetch island bundle: ${url}`);
      return;
    }
    const { default: mod } = await import(/* @vite-ignore */ url);
    module = { default: mod };
    loaded.set(name, module);
  }

  const props = decodeProps(propsEncoded);
  await module.default(props, el);
}

/** Strategy: "immediate" */
async function hydrateImmediate(el: Element): Promise<void> {
  await hydrateOne(el);
}

/** Strategy: "visible" - hydrate when element enters viewport */
async function hydrateVisible(el: Element): Promise<void> {
  await new Promise<void>((resolve) => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          hydrateOne(el).then(resolve).catch(() => resolve());
          break;
        }
      }
    });
    observer.observe(el);
  });
}

/** Strategy: "idle" - hydrate during browser idle time */
async function hydrateIdle(el: Element): Promise<void> {
  await new Promise<void>((resolve) => {
    const cb = () => {
      (idleCallback as { disconnect?: () => void })?.disconnect?.();
      hydrateOne(el).then(resolve).catch(() => resolve());
    };
    const rid = (window as typeof window & {
      requestIdleCallback: (cb: () => void) => number;
    }).requestIdleCallback;
    const idleCallback = rid ? rid(cb) : setTimeout(cb, 0);
  });
}

/**
 * Entry point. Called once after DOMContentLoaded.
 * Respects data-strategy for each island.
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

// Auto-bootstrap
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => hydrateAll());
  } else {
    hydrateAll();
  }
}
