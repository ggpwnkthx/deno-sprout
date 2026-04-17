// lib/routes-manifest.ts - Routes manifest generation and loading
import type {
  RouteManifestEntry,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";

/**
 * Generate the routes manifest for build time.
 * This is called by the build process to create the manifest that will be
 * read at runtime on Deno Deploy.
 */
export function generateRoutesManifest(
  routes: RouteManifestEntry[],
  builtAt: string,
  version: string,
): RoutesManifest {
  return {
    routes,
    builtAt,
    version,
  };
}

/**
 * Load the routes manifest at runtime.
 * Used by fsRoutesFromManifest to register routes on Deno Deploy.
 */
export async function loadRoutesManifest(
  manifestPath: string,
): Promise<RoutesManifest> {
  const url = `file://${manifestPath}`;
  const manifest = await import(url, { with: { type: "json" } });
  return manifest.default as RoutesManifest;
}
