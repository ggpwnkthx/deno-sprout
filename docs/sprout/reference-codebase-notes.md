# Sprout Build Plan

## 20. Implementation Notes From the Reference Codebase

The current codebase provides useful lessons but should not dictate the new public API:

- The existing package split proves the value of separating config, build, JSX, manifest, core server, and utilities.
- The existing placeholder-based island runtime is a good MVP model, but should be described as mounting rather than hydration.
- The existing registry-by-component-reference design is the right direction for allowing route JSX to render island components without explicit markers.
- The existing production build’s safe outDir guard, gzip negotiation, frozen manifest, and dev cache invalidation are worth preserving as internal behavior.
- The existing manual `route()` / `island()` app manifest and `createIsland(Component)` user contract should not be carried forward into the new public DX.
