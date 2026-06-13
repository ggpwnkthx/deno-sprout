// Default values for the configuration contract.
//
// `DEFAULTS` carries the static defaults that never depend on the run
// mode. Mode-driven defaults (sourcemap, minify, maxBytes) are filled
// in by `resolveConfig` at resolve time, not here, so that the same
// `DEFAULTS` object is usable for both development and production.
//
// The default cap of 16 MiB for the bounded frozen asset cache is the
// M2 choice; later milestones may make it configurable from the
// environment.
import type {
  BuildConfig,
  ConfigInput,
  IslandDiscoveryConfig,
  RouteDiscoveryConfig,
} from "./types.ts";

/** Fully-required view of a discovery config. */
type RequiredDiscovery = Required<RouteDiscoveryConfig>;
/** Fully-required view of the static build defaults (mode-driven fields left for the resolver). */
type RequiredBuildDefaults = Omit<Required<BuildConfig>, "sourcemap" | "minify"> & {
  /** Sentinel; the resolver fills this in from the active mode. */
  readonly sourcemap: null;
  /** Sentinel; the resolver fills this in from the active mode. */
  readonly minify: null;
};
/** Static defaults for every optional config field. */
export type DefaultsShape = {
  readonly srcDir: string;
  readonly publicDir: string;
  readonly outDir: string;
  readonly routes: RequiredDiscovery;
  readonly islands: RequiredDiscovery;
  readonly build: RequiredBuildDefaults;
  readonly server: Required<NonNullable<ConfigInput["server"]>>;
};

/** Static default values for every optional config field. */
export const DEFAULTS: DefaultsShape = {
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
    // The sourcemap / minify defaults are filled in at resolve time
    // from the active `Mode`. The literal `null` here is a sentinel
    // that the resolver replaces; consumers should never observe a
    // `null` in a `ResolvedConfig`.
    sourcemap: null,
    minify: null,
    frozenAssetCache: "none",
  },
  server: {
    hostname: "0.0.0.0",
    port: 8000,
  },
};

/** Default cap for the bounded frozen asset cache, in bytes. */
export const DEFAULT_FROZEN_ASSET_CACHE_MAX_BYTES = 16 * 1024 * 1024;

// Re-export the inner discovery type to avoid a type-only import cycle
// in this module.
export type { IslandDiscoveryConfig, RouteDiscoveryConfig };
