// Warm up the island registry at startup.
//
// `warmupIslands` is called once by `buildApp` after manifest validation.
// It pre-loads every island from the manifest and registers the default
// export with the server-side island registry. The registry is
// process-global and idempotent (re-registration is a no-op for a given
// component identity), so calling this once at startup avoids the
// per-request dynamic import overhead for ESM-cached modules.
import { toFileUrl } from "@std/path";
import { registerIslandComponent } from "@sprout/jsx/server/island-registry";
import type { IslandMetadata } from "@sprout/jsx/server/island-registry";
import type { Manifest } from "@sprout/compiler";
import { CoreError } from "./errors.ts";

/**
 * Pre-load and register every island from the manifest. Registration
 * is idempotent for a module identity, so repeated calls are safe.
 * Called once at app startup to avoid per-request import overhead.
 */
export async function warmupIslands(manifest: Manifest): Promise<void> {
  for (const island of manifest.islands) {
    const fileUrl = toFileUrl(island.file).href;
    const mod = await import(fileUrl) as Record<string, unknown>;
    const component = mod[island.exportName];
    if (component === undefined || component === null) {
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `island ${JSON.stringify(island.id)} has no default export`,
        { id: island.id, file: island.file },
      );
    }
    if (typeof component !== "function" && typeof component !== "object") {
      throw new CoreError(
        "ROUTE_RENDER_FAILED",
        `island ${JSON.stringify(island.id)} default export is not a component`,
        { id: island.id, file: island.file, type: typeof component },
      );
    }
    const metadata: IslandMetadata = {
      id: island.id,
      src: island.publicPath,
    };
    registerIslandComponent(component, metadata);
  }
}
