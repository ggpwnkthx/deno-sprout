// lib/bundler.ts - On-the-fly island bundler middleware
import { transpile } from "@ggpwnkthx/sprout-build/lib/esbuild";
import { generateIslandWrapper } from "@ggpwnkthx/sprout-islands/lib/wrapper-template";
import type { MiddlewareHandler } from "@hono/hono";
import { join } from "@std/path";

export interface DevBundlerOptions {
  /** Absolute path to the islands/ directory. */
  islandsDir: string;
  /** Absolute path to the islands/lib/runtime.ts file. */
  runtimePath: string;
  /** Absolute path to the islands/lib/mount.ts file (PLAN-2 Task 4b). */
  mountPath: string;
}

// Map from island name, "hydrate", or "mount" → compiled JS text
const cache = new Map<string, string>();

/**
 * Returns a Hono middleware that handles:
 *   GET /_sprout/hydrate.js
 *     → transpile packages/islands/lib/runtime.ts → return JS
 *   GET /_sprout/runtime/mount.js
 *     → transpile packages/islands/lib/mount.ts → return JS
 *   GET /_sprout/islands/:name.js
 *     → call generateIslandWrapper(name) to get wrapper source text,
 *       pass to transpile({ source, name, resolveDir: islandsDir }) so esbuild
 *       follows the "./{name}.tsx" import and bundles wrapper + component → return JS
 *
 * Results are cached in memory per file-change epoch.
 * The cache is invalidated by passing invalidate() to the HMR watcher.
 */
export function devIslandBundler(options: DevBundlerOptions): {
  middleware: MiddlewareHandler;
  /** Call this when a source file changes to bust the cache. */
  invalidate(filePath: string): void;
} {
  const middleware: MiddlewareHandler = async (c, next) => {
    const path = c.req.path;

    // Handle /_sprout/hydrate.js
    if (path === "/_sprout/hydrate.js") {
      let code = cache.get("hydrate");
      if (!code) {
        const source = await Deno.readTextFile(options.runtimePath);
        const result = await transpile({
          source,
          name: "hydrate",
          minify: false,
        });
        code = result.code;
        cache.set("hydrate", code);
      }
      return c.text(code, 200, { "Content-Type": "application/javascript" });
    }

    // Handle /_sprout/runtime/mount.js
    if (path === "/_sprout/runtime/mount.js") {
      let code = cache.get("mount");
      if (!code) {
        const source = await Deno.readTextFile(options.mountPath);
        const result = await transpile({
          source,
          name: "mount",
          minify: false,
        });
        code = result.code;
        cache.set("mount", code);
      }
      return c.text(code, 200, { "Content-Type": "application/javascript" });
    }

    // Handle /_sprout/islands/:name.js
    const islandsMatch = path.match(/^\/_sprout\/islands\/(.+)\.js$/);
    if (islandsMatch) {
      const name = islandsMatch[1];
      let code = cache.get(name);
      if (!code) {
        // Check if the island file exists
        const islandPath = join(options.islandsDir, `${name}.tsx`);
        try {
          await Deno.stat(islandPath);
        } catch {
          return c.text(`Island "${name}" not found`, 404);
        }

        const wrapperSource = generateIslandWrapper(name);
        const result = await transpile({
          source: wrapperSource,
          name,
          minify: false,
          resolveDir: options.islandsDir,
        });
        code = result.code;
        cache.set(name, code);
      }
      return c.text(code, 200, { "Content-Type": "application/javascript" });
    }

    await next();
  };

  function invalidate(filePath: string): void {
    // Extract the island name from the file path
    // e.g. "/path/to/islands/Counter.tsx" → "Counter"
    // e.g. "/path/to/islands/lib/runtime.ts" → "hydrate"
    // e.g. "/path/to/islands/lib/mount.ts" → "mount"

    if (
      filePath.endsWith("/lib/runtime.ts") ||
      filePath.endsWith("lib/runtime.ts")
    ) {
      cache.delete("hydrate");
    } else if (
      filePath.endsWith("/lib/mount.ts") || filePath.endsWith("lib/mount.ts")
    ) {
      cache.delete("mount");
    } else {
      // It's an island file - extract name
      const match = filePath.match(/islands\/([^/]+)\.tsx?$/);
      if (match) {
        cache.delete(match[1]);
      }
    }
  }

  return { middleware, invalidate };
}
