// Test utilities for the dev asset pipeline.
//
// This file is excluded from the published package. It re-exports the
// internal `__dropCacheForTesting` function from `dev_assets.ts` under a
// name that tests can import without a leading-underscore path signal.
import { __dropCacheForTesting } from "./dev_assets.ts";

/**
 * Reset the module-level dev cache.
 *
 * Tests call this between runs to ensure a clean cache state. The
 * underlying `__dropCacheForTesting` is package-internal; this
 * re-export is the test-only public surface.
 */
export function resetDevCacheForTests(): void {
  __dropCacheForTesting();
}
