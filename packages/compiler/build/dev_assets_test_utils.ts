// Test utilities for the dev asset pipeline.
//
// This file is excluded from the published package. It provides the
// `resetDevCacheForTests()` function that tests call between runs to
// ensure a clean cache state.
import { resetAllCachesForTesting } from "./dev_assets.ts";

/**
 * Drop every cache entry and remove all cache instances.
 *
 * Tests call this between runs to ensure a clean cache state. This
 * is the only public test surface for the internal cache module.
 */
export function resetDevCacheForTests(): void {
  resetAllCachesForTesting();
}
