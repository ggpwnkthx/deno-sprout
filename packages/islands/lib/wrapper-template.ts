// lib/wrapper-template.ts
// Server-side only. Not bundled for the browser.

/**
 * Generate the TypeScript source text of a browser-side island wrapper module.
 *
 * The generated module:
 *   1. Imports `mount` from `/_sprout/runtime/mount.js` (the URL path always
 *      resolves correctly in the browser regardless of project structure).
 *   2. Imports the island component by name from `"./{name}.tsx"`, which
 *      resolves relative to the island source file when esbuild bundles them
 *      together. The bundler's `stdin.resolveDir` must be set to `islandsDir`.
 *   3. Exports a `default function hydrate(props, el)` — the interface that
 *      `hydrateAll()` in `runtime.ts` (Task 4) expects.
 *
 * @param name  Island name without extension, e.g. `"Counter"`. Used as the
 *              component import path and in the error message string.
 * @returns     TypeScript source text. Pass directly to `transpile()` from
 *              `sprout-build/lib/esbuild` with `loader: "ts"`.
 */
export function generateIslandWrapper(name: string): string {
  return `\
import { mount } from "/_sprout/runtime/mount.js";
import Component from "./${name}.tsx";

export default function hydrate(props, el) {
  mount(Component, props, el).catch(
    (err) => console.error("[sprout] Failed to hydrate island ${name}:", err),
  );
}
`;
}
