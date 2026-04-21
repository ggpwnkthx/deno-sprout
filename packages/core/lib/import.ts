// lib/import.ts - Route module import helpers
import { toFileUrl } from "@std/path";

/**
 * Attempt to import a route module (e.g. _404.tsx).
 *
 * Returns `null` if: the file does not exist, the path escapes `routesDirReal`,
 * or the module has no default export.
 * Re-throws on unexpected errors (permission denied, symlink loops, etc.)
 * — these indicate configuration problems, not missing files.
 *
 * @param filePath - Absolute path to the module to import
 * @param routesDirReal - The canonical routes directory path for containment checks
 * @param sep - OS path separator
 * @returns The imported module's namespace, or `null` if the file is absent or escaped
 */
export async function tryImport(
  filePath: string,
  routesDirReal?: string,
  sep?: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Containment check: if routesDirReal is provided, the resolved path must
    // be within it. This prevents a planted symlink at _404.tsx from importing
    // files outside the routes directory.
    if (routesDirReal && sep) {
      const absReal = await Deno.realPath(filePath);
      if (
        absReal !== routesDirReal &&
        !absReal.startsWith(routesDirReal + sep)
      ) {
        return null; // escaped — skip custom 404 handler
      }
    }
    // Dynamic import fails if the file doesn't exist — no need for Deno.stat first.
    return await import(String(toFileUrl(filePath))) as Record<
      string,
      unknown
    >;
  } catch (e) {
    if (
      e instanceof Deno.errors.NotFound ||
      e instanceof TypeError // Module not found
    ) {
      return null;
    }
    throw e;
  }
}
