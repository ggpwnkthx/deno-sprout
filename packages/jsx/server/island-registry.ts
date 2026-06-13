// Public subpath for the server-side island registry.
//
// The registry is "internal-but-exported": `@sprout/core` and tests
// import from here, but it is not promoted in user-facing docs.
export {
  clearIslandRegistry,
  lookupIslandMetadata,
  registerIslandComponent,
} from "./island_registry.ts";
export type { IslandMetadata } from "./island_registry.ts";
