/**
 * @fileoverview Island wrapper template generator for build-time code generation.
 *
 * Server-side only. Produces TypeScript source code for a minimal browser
 * module that imports and mounts an island component. The generated code
 * is consumed by the build pipeline (esbuild transpile) and included in
 * the island bundle.
 */

const DEFAULT_MOUNT_URL = "/_sprout/runtime/mount.js";

/**
 * Escape a string for safe use in an HTML attribute value.
 */
function escapeAttr(str: string): string {
  return str.replace(
    /["<>&]/g,
    (c) =>
      c === '"' ? "&quot;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

/**
 * Options for {@link generateIslandWrapper}.
 */
export interface WrapperOptions {
  /**
   * URL path to the mount module. Defaults to `/_sprout/runtime/mount.js`.
   * Override this when deploying to a custom path.
   */
  mountUrl?: string;
}

/**
 * Generate the TypeScript source text of a browser-side island wrapper module.
 *
 * The generated module:
 *   1. Imports `mount` from the configured `mountUrl` (default:
 *      `/_sprout/runtime/mount.js`).
 *   2. Imports the island component by name from `"./{name}.tsx"`, which
 *      resolves relative to the island source file when esbuild bundles them
 *      together. The bundler's `stdin.resolveDir` must be set to `islandsDir`.
 *   3. Exports a `default function hydrate(props, el)` - the interface that
 *      `hydrateAll()` in `runtime.ts` expects.
 *   4. Catches mount errors, logs them, and dispatches `island-error` on `el`
 *      so the host application can observe failures.
 *
 * @param name  Island name without extension, e.g. `"Counter"`. Used as the
 *              component import path, error message, and event `island` field.
 * @param opts  Optional {@link WrapperOptions}.
 * @returns     TypeScript source text. Pass directly to `transpile()` from
 *              `sprout-build/lib/esbuild` with `loader: "ts"`.
 */
export function generateIslandWrapper(
  name: string,
  opts: WrapperOptions = {},
): string {
  const mountUrl = opts.mountUrl ?? DEFAULT_MOUNT_URL;
  const escapedName = escapeAttr(name);
  return `\
import { mount } from "${mountUrl}";
import { IslandErrorEvent } from "${mountUrl}";
import Component from "./${escapedName}.tsx";

export default function hydrate(props, el) {
  Promise.resolve(mount(Component, props, el)).catch((err) => {
    console.error("[sprout] Failed to hydrate island ${escapedName}:", err);
    // Guard mirrors mount.ts:35 — keep in sync if the guard ever changes.
    if (typeof el.dispatchEvent === "function") {
      el.dispatchEvent(new IslandErrorEvent({
        error: err instanceof Error ? err : new Error(String(err)),
        island: "${escapedName}",
      }));
    }
  });
}
`;
}
