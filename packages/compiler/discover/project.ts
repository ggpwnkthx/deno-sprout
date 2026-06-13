// Project-wide discovery entry point.
//
// Runs the route and island discovery walks in parallel and combines
// them with the resolved stylesheet path. The `DiscoveredProject`
// return value feeds `validateManifest` for the final internal
// manifest.
import type { ResolvedConfig } from "@sprout/config";
import { discoverIslands } from "./islands.ts";
import { discoverRoutes } from "./routes.ts";
import type { DiscoveredProject } from "../manifest/types.ts";

/**
 * Discover every route, island, and global stylesheet in the
 * project described by `config`.
 *
 * Discovery is parallelized for routes and islands. Errors from
 * either side propagate as the typed `CompilerError` instances the
 * sub-functions throw.
 */
export async function discoverProject(
  config: ResolvedConfig,
): Promise<DiscoveredProject> {
  const [routes, islands] = await Promise.all([
    discoverRoutes(config),
    discoverIslands(config),
  ]);
  return {
    routes,
    islands,
    styles: { app: config.styles.app },
  };
}
