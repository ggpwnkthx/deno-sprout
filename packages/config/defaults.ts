// Default values for the configuration contract.
//
// `DEFAULTS` carries the static defaults that never depend on the run
// mode. Mode-driven defaults (sourcemap, minify) are filled in by
// `resolveConfig` at resolve time, not here, so that the same `DEFAULTS`
// object is usable for both development and production.
//
// The default cap of 16 MiB for the bounded frozen asset cache is the
// M2 choice; later milestones may make it configurable from the
// environment.
import type { Mode, ResolvedBuild, ResolvedDiscovery, ResolvedServer } from "./types.ts";

/**
 * Static defaults — values that never depend on the run mode.
 */
export type StaticDefaults = {
  readonly srcDir: string;
  readonly publicDir: string;
  readonly outDir: string;
  readonly routes: ResolvedDiscovery;
  readonly islands: ResolvedDiscovery;
  readonly build: Omit<ResolvedBuild, "sourcemap" | "minify">;
  readonly server: ResolvedServer;
};

/**
 * Resolver-side fills for mode-driven build defaults. The resolver
 * applies `development` / `production` to produce these values;
 * consumers should read them from `ResolvedConfig`, not from
 * `DEFAULTS`.
 */
export type ModeDrivenBuildDefaults = {
  readonly sourcemap: boolean;
  readonly minify: boolean;
};

/**
 * Static default values for every optional config field. The
 * `sourcemap` and `minify` fields are filled in by the resolver
 * from the active `Mode`; this object carries the placeholders
 * (undefined for those two fields).
 */
export const DEFAULTS: StaticDefaults = {
  srcDir: "src",
  publicDir: "public",
  outDir: ".sprout/dist",
  routes: {
    dir: "src/routes",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
  },
  islands: {
    dir: "src/islands",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
  },
  build: {
    compress: "gzip",
    // sourcemap and minify are filled by resolveConfig from the active Mode.
    frozenAssetCache: "none",
  },
  server: { hostname: "0.0.0.0", port: 8000 },
};

/** Map from mode to the two mode-driven boolean defaults. */
export const MODE_DRIVEN_BUILD_DEFAULTS: Readonly<Record<Mode, ModeDrivenBuildDefaults>> = {
  development: { sourcemap: true, minify: false },
  production: { sourcemap: false, minify: true },
};

/** Default cap for the bounded frozen asset cache, in bytes. */
export const DEFAULT_FROZEN_ASSET_CACHE_MAX_BYTES = 16 * 1024 * 1024;
