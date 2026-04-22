// _shared/fixtures.ts - Shared test fixture factories for @ggpwnkthx/sprout-dev
import { dirname, join } from "@std/path";
import { clearBundlerCache } from "../../lib/bundler.ts";

// Derive the monorepo root from this file's location.
// File is at packages/dev/tests/_shared/fixtures.ts (5 levels deep), so we need 5 dirname calls.
const MONOREPO_ROOT = dirname(
  dirname(dirname(dirname(dirname(new URL(import.meta.url).pathname)))),
);

/**
 * Build a minimal fixture for bundler tests.
 * Calls clearBundlerCache() first to ensure a clean cache state.
 */
export async function buildBundlerFixture(): Promise<{
  islandsDir: string;
  runtimePath: string;
  mountPath: string;
  signalsPath: string;
  islandPath: string;
}> {
  clearBundlerCache();

  const runtimePath = join(
    MONOREPO_ROOT,
    "packages",
    "islands",
    "lib",
    "runtime.ts",
  );
  const mountPath = join(
    MONOREPO_ROOT,
    "packages",
    "islands",
    "lib",
    "mount.ts",
  );
  const signalsPath = join(
    MONOREPO_ROOT,
    "packages",
    "islands",
    "signals.ts",
  );

  const islandsDir = await Deno.makeTempDir({ prefix: "sprout-dev-bundler-" });
  const islandPath = join(islandsDir, "Counter.tsx");
  await Deno.writeTextFile(
    islandPath,
    `export default function Counter({ initialCount = 0 }) {
      return "<p>Count: " + initialCount + "</p>";
    }`,
  );

  return { islandsDir, runtimePath, mountPath, signalsPath, islandPath };
}
