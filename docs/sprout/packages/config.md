# Sprout Build Plan

## 5.3 `@sprout/config`

### Purpose

`@sprout/config` defines and validates the configuration contract. It should produce a fully resolved config with absolute, slash-normalized paths and validated options.

### Public Exports

```ts
export { defineConfig } from "./define_config.ts";
export { loadConfig, resolveConfig } from "./load_config.ts";
export type {
  BuildConfig,
  ConfigInput,
  DiscoveredConfig,
  IslandDiscoveryConfig,
  Mode,
  ResolvedConfig,
  RouteDiscoveryConfig,
  StyleConfig,
} from "./types.ts";
```

### Config Types

```ts
export type Mode = "development" | "production";

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

export type RouteDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

export type IslandDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

export type StyleConfig = {
  readonly app?: string | false;
};

export type BuildConfig = {
  readonly compress?: false | "gzip";
  readonly sourcemap?: boolean;
  readonly minify?: boolean;
  readonly frozenAssetCache?:
    | "none"
    | { readonly kind: "bounded"; readonly maxBytes?: number };
};

export type ResolvedConfig = {
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
```

### Defaults

```ts
const defaults = {
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
  styles: {
    app: "src/styles/app.css if it exists, otherwise null",
  },
  build: {
    compress: "gzip",
    sourcemap: "true in development, false in production",
    minify: "false in development, true in production",
    frozenAssetCache: "none",
  },
  server: {
    hostname: "localhost",
    port: 8000,
  },
};
```

### Validation Rules

- `root`, `srcDir`, `publicDir`, `outDir`, route dir, island dir, and style paths must resolve inside `root` unless a future explicit external-path escape hatch is added.
- `port` must be an integer between `1` and `65535`.
- `hostname` must be a non-empty string.
- `compress` must be `false` or `"gzip"`.
- `frozenAssetCache.maxBytes` must be a positive integer.
- `include` and `exclude` patterns must be non-empty strings.
- Unknown top-level keys should be rejected in strict mode and warned in default mode.

### Error Codes

```ts
type ConfigErrorCode =
  | "CONFIG_IMPORT_FAILED"
  | "CONFIG_INVALID_SHAPE"
  | "CONFIG_INVALID_PATH"
  | "CONFIG_PATH_OUTSIDE_ROOT"
  | "CONFIG_INVALID_PORT"
  | "CONFIG_INVALID_CACHE_POLICY";
```

### Dependencies

- `@sprout/utils`
- `jsr:@std/fs`
- `jsr:@std/path`

Avoid schema libraries initially. Hand-written validators keep dependency weight low and error messages precise.

### Permissions

```text
--allow-read     read config file and detect default stylesheet/public directory
--allow-env      optional env overrides if supported
```

### Required Tests

- Missing config file resolves defaults.
- Config default export is loaded.
- Config named export is either supported explicitly or rejected consistently.
- Relative paths resolve against root.
- Absolute paths inside root are accepted.
- Sibling-prefix escapes are rejected.
- Invalid cache policy throws typed error.
- Invalid port throws typed error.

### Done Criteria

- Every package receives a `ResolvedConfig`, never raw config input.
- All path comparisons use slash-normalized absolute paths.
- Config loading does not create files or start servers.

---
