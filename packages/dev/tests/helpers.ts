// helpers.ts - Shared test utilities for @ggpwnkthx/sprout-dev tests
import { join } from "@std/path";
import { createDevServer } from "../server.ts";
import type { App } from "@ggpwnkthx/sprout-core/app";
export { withTempDir, writeFile, writeIsland, writeRoute } from "./write.ts";

/**
 * Create a dev server and clean up its HMR watcher when done.
 */
export async function createServerAndClose(root: string): Promise<App> {
  const app = await createDevServer({ root });
  const watcher = (app as unknown as { _hmrWatcher?: { close: () => void } })
    ._hmrWatcher;
  if (watcher) {
    watcher.close();
  }
  return app;
}

/**
 * Build a minimal project fixture: routes/index.tsx, islands/, static/ dirs.
 * Returns paths for all three key directories.
 */
export async function buildFixture(): Promise<{
  root: string;
  routesDir: string;
  islandsDir: string;
  staticDir: string;
}> {
  const root = await Deno.makeTempDir({ prefix: "sprout-dev-fixture-" });
  const routesDir = join(root, "routes");
  const islandsDir = join(root, "islands");
  const staticDir = join(root, "static");

  await Deno.mkdir(routesDir, { recursive: true });
  await Deno.writeTextFile(
    join(routesDir, "index.tsx"),
    `export default function Index() {
      return "<html><body><h1>Hello from dev server</h1></body></html>";
    }`,
  );

  await Deno.mkdir(islandsDir, { recursive: true });
  await Deno.mkdir(staticDir, { recursive: true });

  return { root, routesDir, islandsDir, staticDir };
}
