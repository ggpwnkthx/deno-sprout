/**
 * On-the-fly island bundler middleware for Sprout dev server.
 *
 * Intercepts requests at dev-time paths and transpiles island components
 * using esbuild. All results are cached in memory per file-change epoch;
 * the cache is invalidated by calling the returned `invalidate()` function
 * when source files change.
 *
 * Handled paths:
 * - `/_sprout/hydrate.js` — transpiled hydration runtime
 * - `/_sprout/runtime/mount.js` — transpiled mount runtime
 * - `/_sprout/islands/{name}.js` — bundled island component + wrapper
 *
 * @module
 */
import { transpile } from "@ggpwnkthx/sprout-build/lib/esbuild";
import { generateIslandWrapper } from "@ggpwnkthx/sprout-islands/lib/wrapper-template";
import type { MiddlewareHandler } from "@hono/hono";
import { dirname, join } from "@std/path";

export interface DevBundlerOptions {
  /** Absolute path to the islands/ directory. */
  islandsDir: string;
  /** Absolute path to the islands/lib/runtime.ts file. */
  runtimePath: string;
  /** Absolute path to the islands/lib/mount.ts file. */
  mountPath: string;
  /** Absolute path to the islands/signals.ts file. */
  signalsPath: string;
}

// Map from island name, "hydrate", or "mount" → compiled JS text
const cache = new Map<string, string>();

/**
 * Reverse index: absolute island file path → cache key.
 * Used by `invalidate()` to look up the cache key from a changed file path
 * without needing fragile regex extraction of island names.
 */
const islandPathToKey = new Map<string, string>();

/** Clear the bundler cache. Exported for use in tests. */
export function clearBundlerCache(): void {
  cache.clear();
  islandPathToKey.clear();
}

/**
 * Error shape returned by the island bundler middleware.
 *
 * All error responses from this module conform to this shape.
 */
export interface BundlerError {
  error: string;
  message: string;
}

/**
 * Attempt to load and transpile a file from `filePath`, storing the result
 * under `key` in the module-level `cache`.
 *
 * @param key - Cache key (e.g. `"hydrate"`, `"mount"`, or an island name).
 * @param filePath - Absolute path to the source file.
 * @param transpileOpts - Options forwarded to `transpile` (except `source`).
 *   May include `resolveDir` to enable bundling of sibling imports.
 * @param notFoundLabel - Error code for the 404 response body.
 * @param notFoundMessage - Human-readable message for the 404 response body.
 * @param c - Hono context (provides json() and text()).
 * @returns A Hono `Response` on error; `null` on cache hit or successful
 *   transpile (caller reads from `cache`).
 */
async function transpileCached(
  key: string,
  filePath: string,
  transpileOpts: { name: string; resolveDir?: string },
  notFoundLabel: string,
  notFoundMessage: string,
  c: {
    json(data: unknown, status?: number): unknown;
    text(
      body: string,
      status?: number,
      headers?: Record<string, string>,
    ): unknown;
  },
): Promise<Response | null> {
  const cached = cache.get(key);
  if (cached !== undefined) return null;

  try {
    const source = await Deno.readTextFile(filePath);
    const result = await transpile({ source, ...transpileOpts });
    cache.set(key, result.code);
    return null;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return c.json(
        { error: notFoundLabel, message: notFoundMessage },
        404,
      ) as Response;
    }
    // Deno.readTextFile throws PermissionDenied, NotCapable, etc.
    // Treat all unexpected errors as internal errors.
    return c.json(
      { error: "internal_error", message: "Failed to load bundle source" },
      500,
    ) as Response;
  }
}

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
      const err = await transpileCached(
        "hydrate",
        options.runtimePath,
        { name: "hydrate", resolveDir: dirname(options.runtimePath) },
        "island_not_found",
        "Runtime file not found",
        c,
      );
      if (err) return err;
      return c.text(cache.get("hydrate")!, 200, {
        "Content-Type": "application/javascript",
      });
    }

    // Handle /_sprout/runtime/mount.js
    if (path === "/_sprout/runtime/mount.js") {
      const err = await transpileCached(
        "mount",
        options.mountPath,
        { name: "mount", resolveDir: dirname(options.mountPath) },
        "island_not_found",
        "Mount file not found",
        c,
      );
      if (err) return err;
      return c.text(cache.get("mount")!, 200, {
        "Content-Type": "application/javascript",
      });
    }

    // Handle /_sprout/signals.js
    if (path === "/_sprout/signals.js") {
      const err = await transpileCached(
        "signals",
        options.signalsPath,
        { name: "signals", resolveDir: dirname(options.signalsPath) },
        "signals_not_found",
        "Signals file not found",
        c,
      );
      if (err) return err;
      return c.text(cache.get("signals")!, 200, {
        "Content-Type": "application/javascript",
      });
    }

    // Handle /_sprout/islands/:name.js
    // Only accept island names made of safe characters — no path separators.
    // This prevents semantic misuse (island names should not contain /) and
    // ensures the file path stays within islandsDir.
    const islandsMatch = path.match(
      /^\/_sprout\/islands\/([a-zA-Z0-9_-]+)\.js$/,
    );
    if (islandsMatch) {
      const name = islandsMatch[1];
      const cached = cache.get(name);
      if (cached !== undefined) {
        return c.text(cached, 200, {
          "Content-Type": "application/javascript",
        });
      }

      const islandPath = join(options.islandsDir, `${name}.tsx`);
      let stat: Deno.FileInfo;
      try {
        stat = await Deno.stat(islandPath);
      } catch (err) {
        if (err instanceof Deno.errors.NotFound) {
          return c.json(
            {
              error: "island_not_found",
              message: `Island "${name}" not found`,
            },
            404,
          );
        }
        return c.json(
          { error: "internal_error", message: "Failed to stat island" },
          500,
        );
      }
      if (!stat.isFile) {
        return c.json(
          { error: "island_not_found", message: `"${name}" is not a file` },
          404,
        );
      }

      const wrapperSource = generateIslandWrapper(name);
      const result = await transpile({
        source: wrapperSource,
        name,
        minify: false,
        resolveDir: options.islandsDir,
      });
      // Register the path→key mapping so invalidate() can find the key
      // from the file path without doing fragile regex extraction.
      islandPathToKey.set(islandPath, name);
      cache.set(name, result.code);
      return c.text(result.code, 200, {
        "Content-Type": "application/javascript",
      });
    }

    await next();
  };

  /**
   * Invalidate cached transpilation results when a source file changes.
   *
   * The reverse index `islandPathToKey` is consulted first so that any
   * absolute file path can be invalidated without knowing its cache key.
   * For paths not in the index, island name is extracted via regex as a
   * fallback (handles hot-reload via HMR where the path may not be registered).
   *
   * Special keys:
   * - `.../islands/lib/runtime.ts`  → invalidates `"hydrate"`
   * - `.../islands/lib/mount.ts`    → invalidates `"mount"`
   * - `.../islands/lib/stringify.ts` → invalidates `"mount"`
   * - `.../islands/signals.ts`      → invalidates `"signals"`
   *
   * Paths that do not match any cache key are silently ignored.
   */
  function invalidate(filePath: string): void {
    if (
      filePath.endsWith("/lib/runtime.ts") ||
      filePath.endsWith("lib/runtime.ts")
    ) {
      cache.delete("hydrate");
    } else if (
      filePath.endsWith("/lib/mount.ts") ||
      filePath.endsWith("lib/mount.ts") ||
      filePath.endsWith("/lib/stringify.ts") ||
      filePath.endsWith("lib/stringify.ts")
    ) {
      cache.delete("mount");
    } else if (
      filePath.endsWith("/signals.ts") ||
      filePath.endsWith("signals.ts")
    ) {
      cache.delete("signals");
    } else {
      // Try the reverse index first (exact match for registered island paths).
      const key = islandPathToKey.get(filePath);
      if (key !== undefined) {
        cache.delete(key);
        islandPathToKey.delete(filePath);
      } else {
        // Fallback: extract island name via regex.
        // Handles cases where the path was not pre-registered (e.g. HMR
        // fires before the island was ever served, or path differs from registration).
        const match = filePath.match(/islands\/([^.\\/]+)\.tsx?$/);
        if (match) {
          cache.delete(match[1]);
          // Also clean any islandPathToKey entry whose path ends with the
          // matched filename, to prevent the index from accumulating stale entries
          // over long dev sessions.
          for (const [path, k] of islandPathToKey) {
            if (k === match[1]) {
              islandPathToKey.delete(path);
              break;
            }
          }
        }
      }
    }
  }

  return { middleware, invalidate };
}
