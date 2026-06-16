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
// closures alive longer than the user expects; the parallel `Set`
// carries the same references purely to keep the `WeakMap` honest in
// the face of component identity lookups across reloads.
import { RuntimeError, validateIslandPublicPath } from "../shared/mod.ts";

/**
 * Public metadata for a registered island component.
 *
 * The `src` must be a stable public path that the runtime will dynamic
 * `import` in the browser. The template literal type encodes the
 * canonical form: `/@sprout/island/<id>.js`.
 */
export type IslandMetadata = {
  readonly id: string;
  readonly src: `/@sprout/island/${string}.js`;
};

const registry = new WeakMap<object, IslandMetadata>();
const keepAlive = new Set<object>();

/**
 * Register a component reference as an island.
 *
 * The runtime uses component identity to decide whether a JSX tag is an
 * island. The `id` is used as the public identifier in the
 * `data-sprout-island` attribute, and the `src` becomes the value of
 * `data-sprout-src` and the dynamic import URL on the client.
 */
export function registerIslandComponent(
  component: object,
  metadata: IslandMetadata,
): void {
  if (component === null || typeof component !== "object" && typeof component !== "function") {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      "island component must be a function or object reference",
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
  if (typeof metadata.id !== "string" || metadata.id.length === 0) {
    throw new RuntimeError(
      "INVALID_PLACEHOLDER",
      "island id must be a non-empty string",
      { id: String(metadata.id) },
    );
  }
  registry.set(component, metadata);
  keepAlive.add(component);
}

/**
 * Look up the island metadata for a component reference, if any.
 *
 * Returns `undefined` for non-island components. Used by the server
 * JSX runtime to decide whether to emit a placeholder.
 */
export function lookupIslandMetadata(component: object): IslandMetadata | undefined {
  return registry.get(component);
}

/**
 * Clear the registry. Intended for tests; do not call in production
 * code paths without understanding the implications.
 */
export function clearIslandRegistry(): void {
  for (const ref of keepAlive) {
    registry.delete(ref);
  }
  keepAlive.clear();
}
