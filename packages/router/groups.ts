// groups.ts - Route grouping and layout/middleware chain resolution
import { dirname, join } from "@std/path";
import { BoundedCache } from "./lib/cache.ts";

/** Shared chain cache: key = "dir|filename", value = path array. */
const chainCache = new BoundedCache<string, string[]>(64);

/**
 * Walk from `routeFilePath`'s directory up to `routesDir`, collecting files
 * named `filename` that exist on disk. Results are cached per directory.
 *
 * Uses `Deno.realPath` to canonicalize both the routes directory and the
 * current directory before comparing, preventing symlink traversal attacks.
 */
async function resolveChain(
  routeFilePath: string,
  routesDir: string,
  filename: string,
): Promise<string[]> {
  const dir = dirname(routeFilePath);

  // Check cache for this directory level
  const cached = chainCache.get(dir + "|" + filename);
  if (cached !== undefined) return [...cached];

  // Canonicalize routesDir once to prevent symlink traversal
  let canonRoutesDir: string;
  try {
    canonRoutesDir = await Deno.realPath(routesDir);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // routesDir doesn't exist — return empty chain
      return [];
    }
    throw e;
  }

  const chain: string[] = [];
  let currentDir = dir;

  while (
    canonRoutesDir.length > 0 &&
    currentDir.startsWith(canonRoutesDir + "/")
  ) {
    // Canonicalize currentDir on each iteration to follow symlinks during the walk
    let canonCurrentDir: string;
    try {
      canonCurrentDir = await Deno.realPath(currentDir);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // This directory level no longer exists after symlink resolution — stop walk
        break;
      }
      throw e;
    }

    if (!canonCurrentDir.startsWith(canonRoutesDir + "/")) {
      // After realPath resolution the directory is no longer under routesDir — stop
      break;
    }

    const filePath = join(currentDir, filename);

    try {
      await Deno.stat(filePath);
      chain.push(filePath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // silently skip missing files
      } else {
        throw e;
      }
    }

    currentDir = dirname(currentDir);
  }

  // Include root-level file if it exists
  const rootFile = join(canonRoutesDir, filename);
  try {
    await Deno.stat(rootFile);
    chain.unshift(rootFile);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // silently skip
    } else {
      throw e;
    }
  }

  // Cache the result for this directory
  chainCache.set(dir + "|" + filename, [...chain]);
  return chain;
}

/**
 * Collects the chain of layout files (`_layout.tsx`) that apply to the given
 * route file, walking from the file's directory up to `routesDir`.
 *
 * The returned array is ordered from the root layout (most distant) to the
 * nearest layout. Results are cached per directory to avoid repeated filesystem
 * lookups.
 *
 * @param routeFilePath - Absolute path to the route file.
 * @param routesDir - Absolute path to the routes root directory.
 * @returns An array of absolute file paths for each layout in the chain.
 */
export function resolveLayoutChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  return resolveChain(routeFilePath, routesDir, "_layout.tsx");
}

/**
 * Collects the chain of middleware files (`_middleware.ts`) that apply to the
 * given route file, walking from the file's directory up to `routesDir`.
 *
 * The returned array is ordered from the root middleware (most distant) to the
 * nearest middleware. Results are cached per directory to avoid repeated
 * filesystem lookups.
 *
 * @param routeFilePath - Absolute path to the route file.
 * @param routesDir - Absolute path to the routes root directory.
 * @returns An array of absolute file paths for each middleware in the chain.
 */
export function resolveMiddlewareChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  return resolveChain(routeFilePath, routesDir, "_middleware.ts");
}
