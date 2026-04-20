// _shared/fixtures.ts - Shared test fixture factories for @ggpwnkthx/sprout-dev
import { join } from "@std/path";
import { clearBundlerCache } from "../../lib/bundler.ts";

/**
 * Build a minimal fixture for bundler tests.
 * Calls clearBundlerCache() first to ensure a clean cache state.
 */
export async function buildBundlerFixture(): Promise<{
  islandsDir: string;
  runtimePath: string;
  mountPath: string;
  islandPath: string;
}> {
  clearBundlerCache();

  const runtimePath = join(
    Deno.cwd(),
    "packages",
    "islands",
    "lib",
    "runtime.ts",
  );
  const mountPath = join(
    Deno.cwd(),
    "packages",
    "islands",
    "lib",
    "mount.ts",
  );

  const islandsDir = await Deno.makeTempDir({ prefix: "sprout-dev-bundler-" });
  const islandPath = join(islandsDir, "Counter.tsx");
  await Deno.writeTextFile(
    islandPath,
    `export default function Counter({ initialCount = 0 }) {
      return "<p>Count: " + initialCount + "</p>";
    }`,
  );

  return { islandsDir, runtimePath, mountPath, islandPath };
}
