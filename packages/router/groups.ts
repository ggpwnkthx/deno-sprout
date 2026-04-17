// groups.ts - Route grouping and layout/middleware chain resolution
import { dirname, join } from "@std/path";

/**
 * Walk from the route file's directory up to routesDir, collecting `_layout.tsx`
 * files that exist on disk.
 */
export async function resolveLayoutChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  const chain: string[] = [];
  let currentDir = dirname(routeFilePath);

  while (currentDir.startsWith(routesDir + "/")) {
    const layoutPath = join(currentDir, "_layout.tsx");
    try {
      await Deno.stat(layoutPath);
      chain.push(layoutPath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // silently skip missing files
      } else {
        throw e;
      }
    }

    currentDir = dirname(currentDir);
  }
  // Include root _layout if it exists
  const rootLayout = join(routesDir, "_layout.tsx");
  try {
    await Deno.stat(rootLayout);
    chain.unshift(rootLayout);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // silently skip
    } else {
      throw e;
    }
  }

  return chain;
}

/**
 * Walk from the route file's directory up to routesDir, collecting `_middleware.ts`
 * files that exist on disk.
 */
export async function resolveMiddlewareChain(
  routeFilePath: string,
  routesDir: string,
): Promise<string[]> {
  const chain: string[] = [];
  let currentDir = dirname(routeFilePath);

  while (currentDir.startsWith(routesDir + "/")) {
    const middlewarePath = join(currentDir, "_middleware.ts");
    try {
      await Deno.stat(middlewarePath);
      chain.push(middlewarePath);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // silently skip missing files
      } else {
        throw e;
      }
    }

    currentDir = dirname(currentDir);
  }
  // Include root _middleware if it exists
  const rootMiddleware = join(routesDir, "_middleware.ts");
  try {
    await Deno.stat(rootMiddleware);
    chain.unshift(rootMiddleware);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // silently skip
    } else {
      throw e;
    }
  }

  return chain;
}
