// Public re-exports for `@sprout/jsx/server`.
//
// `@sprout/core` and tests import the server JSX runtime, the island
// registry helpers, and the placeholder builder from this subpath.
export {
  clearIslandRegistry,
  lookupIslandMetadata,
  registerIslandComponent,
} from "./island-registry.ts";
export type { IslandMetadata } from "./island-registry.ts";
export { buildIslandPlaceholder } from "./island_placeholder.ts";
export { Fragment, jsx, jsxs } from "./jsx-runtime.ts";
export type { JSX } from "./jsx-runtime.ts";
