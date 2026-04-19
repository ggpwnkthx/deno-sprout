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

export interface DeployIslandAssetsOptions {
  /**
   * Map from island logical name to its content-hashed CDN URL.
   * e.g. { "Counter": "/_sprout/islands/Counter.a1b2c3d4.js" }
   *
   * On Deploy, this is loaded from the bundled _dist/manifest.json.
   */
  islandManifest: Record<string, string>;
  /**
   * Optional CDN base URL prepended to manifest URLs when redirecting.
   * e.g. "https://cdn.example.com" → full CDN URL is constructed.
   * If omitted, the URL from the manifest is used as-is (relative or absolute).
   */
  cdnBase?: string;
}

/**
 * Serve pre-built island bundles on Deno Deploy.
 *
 * Handles:
 *   GET /_sprout/hydrate.js       → redirect to CDN or serve in-memory
 *   GET /_sprout/islands/:name.js → redirect to CDN or serve in-memory
 *
 * Falls through (calls next()) for any other path - allowing the static
 * files middleware or 404 handler to handle it.
 *
 * ## Forward reference
 *
 * Full implementation (including in-memory bundle serving, content-type
 * headers, and cache-control headers) is specced in PLAN-0 and implemented
 * in PLAN-3. This stub is sufficient for the Phase 1 App.init() compile
 * to succeed.
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
