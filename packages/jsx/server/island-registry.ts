// In-memory island component registry used by the server JSX runtime.
//
// Routes register the components they want to render as islands. The
// server JSX runtime checks this registry when JSX receives a function
// component as the tag; if the component is registered, the runtime
// emits a placeholder div instead of executing the component on the
// server.
//
// The registry is intentionally process-local and per-server-instance.
// It uses a `WeakMap` so registered component references do not pin
// closures alive longer than the user expects. Registry lifetime is
// tied to the function reference's lifetime; when the function is
// garbage-collected the entry is cleaned up automatically.
import { RuntimeError, validateIslandPublicPath } from "../shared/mod.ts";

/**
 * Public metadata for a registered island component.
 *
 * The `src` must be a stable public path that the runtime will dynamic
 * `import` in the browser. The template literal type encodes the
 * canonical form: `/@sprout/island/<id>.js`.
 *
 * The `id` field **must** match the id embedded in `src` (the segment
 * between the prefix and the `.js` suffix). Mismatch is a programming
 * error and will throw at registration time.
 */
export type IslandMetadata = {
  /** The island identifier; must equal the id in `src`. */
  readonly id: string;
  readonly src: `/@sprout/island/${string}.js`;
};

const registry = new WeakMap<(...args: never) => unknown, IslandMetadata>();

/**
 * Register a component reference as an island.
 *
 * The runtime uses component identity to decide whether a JSX tag is an
 * island. The `id` is used as the public identifier in the
 * `data-sprout-island` attribute, and the `src` becomes the value of
 * `data-sprout-src` and the dynamic import URL on the client.
 */
export function registerIslandComponent(
  component: (...args: never) => unknown,
  metadata: IslandMetadata,
): void {
  if (typeof component !== "function") {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      "island component must be a function",
      { id: metadata.id },
    );
  }
  const result = validateIslandPublicPath(metadata.src);
  if (!result.ok) {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      `island src is not a canonical "/@sprout/island/<id>.js" path`,
      { src: metadata.src, reason: result.reason },
    );
  }
  if (result.ok && result.id !== metadata.id) {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      "island id does not match the id embedded in src",
      { src: metadata.src, declaredId: metadata.id, canonicalId: result.id },
    );
  }
  if (typeof metadata.id !== "string" || metadata.id.length === 0) {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      "island id must be a non-empty string",
      { id: String(metadata.id) },
    );
  }
  registry.set(component, metadata);
}

/**
 * Look up the island metadata for a component reference, if any.
 *
 * Returns `undefined` for non-island components. Used by the server
 * JSX runtime to decide whether to emit a placeholder.
 */
export function lookupIslandMetadata(
  component: (...args: never) => unknown,
): IslandMetadata | undefined {
  return registry.get(component);
}

/**
 * No-op. The registry is now a `WeakMap` keyed by function reference;
 * entries are garbage-collected when the function is no longer reachable.
 * This function is kept for API stability for any tests that call it.
 */
export function clearIslandRegistry(): void {
  // No-op: WeakMap cleanup is automatic.
}
