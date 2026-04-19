// groups.ts - Route grouping and layout/middleware chain resolution
import { dirname, join } from "@std/path";

/** Shared chain cache keyed by directory path. */
const chainCache = new Map<string, string[]>();

/**
 * Walk from `routeFilePath`'s directory up to `routesDir`, collecting files
 * named `filename` that exist on disk. Results are cached per directory.
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

  const chain: string[] = [];
  let currentDir = dir;

  while (
    routesDir.length > 0 &&
    currentDir.startsWith(routesDir + "/")
  ) {
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
  const rootFile = join(routesDir, filename);
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
 * Walk from the route file's directory up to routesDir, collecting `_layout.tsx`
 * files that exist on disk. Results are cached per directory.
 */
export function resolveLayoutChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  return resolveChain(routeFilePath, routesDir, "_layout.tsx");
}

/**
 * Walk from the route file's directory up to routesDir, collecting `_middleware.ts`
 * files that exist on disk. Results are cached per directory.
 */
export function resolveMiddlewareChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  return resolveChain(routeFilePath, routesDir, "_middleware.ts");
}
