// Type definitions for `@sprout/config`.
//
// `ConfigInput` is the raw object a user exports from `sprout.config.ts`.
// `ResolvedConfig` is the fully validated, fully normalized form every
// other package consumes. The two are kept distinct so that `loadConfig`
// can return a value that downstream code is guaranteed to be able to
// use without further validation.

/** Sprout run mode. Drives default minify / sourcemap / cache policy choices. */
export type Mode = "development" | "production";

/**
 * The raw object a user exports from `sprout.config.ts`. All fields are
 * optional; `loadConfig` fills in defaults and validates shape.
 */
export type ConfigInput = {
  readonly root?: string;
  readonly srcDir?: string;
  readonly publicDir?: string | false;
  readonly outDir?: string;

  readonly routes?: RouteDiscoveryConfig;
  readonly islands?: IslandDiscoveryConfig;
  readonly styles?: StyleConfig;
  readonly build?: BuildConfig;

  readonly server?: {
    readonly hostname?: string;
    readonly port?: number;
  };
};

/** Route discovery settings. */
export type RouteDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

/** Island discovery settings. */
export type IslandDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

/** Global stylesheet settings. */
export type StyleConfig = {
  readonly app?: string | false;
};

/** Build pipeline settings. */
export type BuildConfig = {
  readonly compress?: false | "gzip";
  readonly sourcemap?: boolean;
  readonly minify?: boolean;
  readonly frozenAssetCache?:
    | "none"
    | { readonly kind: "bounded"; readonly maxBytes?: number };
};

/**
 * The fully resolved configuration every package receives.
 *
 * All paths are slash-normalized absolute paths. Mode-driven defaults
 * (`sourcemap`, `minify`, `frozenAssetCache.maxBytes`) are filled in
 * from the resolved `mode` so consumers never have to re-derive them.
 * The `mode` itself is also exposed so packages like `@sprout/core`
 * can pick the right asset pipeline (dev: on-demand compile, prod:
 * frozen manifest) without re-passing it as a separate argument.
 */
export type ResolvedConfig = {
  readonly mode: Mode;
  readonly root: string;
  readonly srcDir: string;
  readonly publicDir: string | null;
  readonly outDir: string;
  readonly routes: Required<RouteDiscoveryConfig>;
  readonly islands: Required<IslandDiscoveryConfig>;
  readonly styles: { readonly app: string | null };
  readonly build: {
    readonly compress: false | "gzip";
    readonly sourcemap: boolean;
    readonly minify: boolean;
    readonly frozenAssetCache:
      | "none"
      | { readonly kind: "bounded"; readonly maxBytes: number };
  };
  readonly server: {
    readonly hostname: string;
    readonly port: number;
  };
};
