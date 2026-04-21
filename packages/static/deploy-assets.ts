// deploy-assets.ts - Deno Deploy-compatible island bundle serving
//
// ## Design (PLAN-0 decision)
//
// On Deno Deploy, island bundles (hashed .js files in _dist/islands/) are
// pre-uploaded to a CDN. This middleware, mounted at /_sprout/*, looks up the
// requested island name in the manifest and redirects (302) to the CDN URL.
//
// If a bundle was embedded as a string at build time (e.g. via a build flag),
// it can be served from an in-memory map instead of redirecting.
//
// This file is NOT used in local dev mode - local dev uses the on-the-fly
// bundler middleware in sprout-dev (PLAN-3).

import type { MiddlewareHandler } from "@hono/hono";

/**
 * Options for {@link deployIslandAssets}.
 *
 * @example
 * ```ts
 * import { deployIslandAssets } from "@ggpwnkthx/sprout-static";
 *
 * app.use(deployIslandAssets({
 *   islandManifest: {
 *     hydrate: "/_sprout/hydrate.a1b2c3d4.js",
 *     Counter: "/_sprout/islands/Counter.a1b2c3d4.js",
 *   },
 *   cdnBase: "https://cdn.example.com",
 * }));
 * ```
 */
export interface DeployIslandAssetsOptions {
  /**
   * Map from island logical name to its content-hashed CDN URL.
   *
   * e.g. `{ "Counter": "/_sprout/islands/Counter.a1b2c3d4.js" }`
   *
   * On Deploy, this is loaded from the bundled `_dist/manifest.json`.
   *
   * URLs may be absolute (e.g. `https://cdn.example.com/_sprout/islands/Counter.js`)
   * or relative (e.g. `/_sprout/islands/Counter.a1b2c3d4.js`). If absolute URLs
   * are used, omit `cdnBase` to avoid a double-hostname redirect
   * (`cdnBase` is always prepended when set).
   */
  islandManifest: Record<string, string>;
  /**
   * Optional CDN base URL prepended to manifest URLs when redirecting.
   *
   * e.g. `"https://cdn.example.com"` → full CDN URL is constructed.
   *
   * If omitted, the URL from the manifest is used as-is (relative or absolute).
   * A trailing slash is automatically stripped to avoid double-slashes.
   */
  cdnBase?: string;
}

/**
 * Serve pre-built island bundles on Deno Deploy by redirecting (302) to
 * their CDN URLs.
 *
 * ## Design (PLAN-0)
 *
 * On Deno Deploy, island bundles (hashed `.js` files in `_dist/islands/`) are
 * pre-uploaded to a CDN. This middleware, mounted at `/_sprout/*`, looks up
 * the requested island name in the manifest and redirects (302) to the CDN URL.
 *
 * If a bundle was embedded as a string at build time (e.g. via a build flag),
 * it can be served from an in-memory map instead of redirecting.
 *
 * **This file is NOT used in local dev mode** - local dev uses the on-the-fly
 * bundler middleware in {@link @ggpwnkthx/sprout-dev} (PLAN-3).
 *
 * ## Request handling
 *
 * | Request path                        | Behaviour                                              |
 * | ----------------------------------- | ------------------------------------------------------ |
 * | `GET /_sprout/hydrate.js`           | 302 redirect to `cdnBase + manifest.hydrate`           |
 * | `GET /_sprout/islands/:Name.js`     | 302 redirect to `cdnBase + manifest[Name]`            |
 * | `/_sprout/*` paths not matched above | Pass through to `next()`                                |
 *
 * If `hydrate` is absent from `islandManifest`, the middleware redirects
 * to `/_sprout/hydrate.js` (self-referential fallback). Only `.js`
 * island bundle names are matched; `.mjs` and `.ts` are passed through.
 *
 * Redirect `Location` header is constructed as `cdnBase.replace(/\\\/$/, "") +
 * manifestUrl`, avoiding double slashes when `cdnBase` has a trailing slash.
 *
 * If the path matches `/_sprout/islands/:name.js` but `:name` is absent from
 * `islandManifest`, the middleware passes through to `next()`, which results
 * in a 404.
 *
 * When `next()` is called (e.g. manifest miss), any downstream 404 response
 * is returned unchanged to the client.
 *
 * @param options - Required configuration. Must include `islandManifest`.
 *                  See {@link DeployIslandAssetsOptions}.
 * @returns A Hono middleware handler.
 */
export function deployIslandAssets(
  options: DeployIslandAssetsOptions,
): MiddlewareHandler {
  const { islandManifest, cdnBase } = options;
  // Normalize cdnBase: remove trailing slash so concatenation with manifest
  // URLs (which start with /) produces a valid URL with a single slash.
  const normalizedCdnBase = cdnBase?.replace(/\/$/, "");

  return async (c, next) => {
    const path = c.req.path;

    // hydrate.js - the client-side hydration runtime
    if (path === "/_sprout/hydrate.js") {
      const hydrateUrl = islandManifest["hydrate"] ?? "/_sprout/hydrate.js";
      const redirectUrl = normalizedCdnBase
        ? `${normalizedCdnBase}${hydrateUrl}`
        : hydrateUrl;
      return c.redirect(redirectUrl, 302);
    }

    // Island bundles: /_sprout/islands/:name.js
    const islandsMatch = path.match(/^\/_sprout\/islands\/([^/]+)\.js$/);
    if (islandsMatch) {
      const name = islandsMatch[1];
      const bundleUrl = islandManifest[name];
      if (bundleUrl) {
        const redirectUrl = normalizedCdnBase
          ? `${normalizedCdnBase}${bundleUrl}`
          : bundleUrl;
        return c.redirect(redirectUrl, 302);
      }
      // Bundle not found in manifest - fall through to 404
    }

    // All other /_sprout/* paths: let the next handler deal with them.
    // Return value of next() is intentionally discarded — this function's
    // contract is redirect-or-pass-through; downstream error responses are
    // returned as-is by Hono's middleware runner.
    await next();
  };
}
