# Config

The project config is a small, well-typed object. Almost every field
has a default, and almost every project starts with the minimum legal
config:

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

export default defineConfig({ root: "." });
```

`sprout.config.ts` is optional. If the file is missing, the loader
fills in every default. This page walks through every field, the
defaults, the validation rules, and the path-resolution contract.

## The minimum legal config

The minimum legal config is the empty object — but `root` is the only
field that has no default, and the framework needs to know where the
project lives. In practice the generated config sets it to `"."`
so the project root is the current working directory:

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

export default defineConfig({ root: "." });
```

`defineConfig` is a thin identity helper exported from `@sprout/core`.
It exists for editor support (autocompletion, hover types) and for
the convention of marking "this is a Sprout config". The function
returns its argument unchanged.

## The default shape

Every field is optional. The full list of fields, in the order they
appear in the resolved config:

```ts
type ResolvedConfig = {
  readonly mode: "development" | "production";
  readonly root: string;
  readonly srcDir: string;
  readonly publicDir: string | null;
  readonly outDir: string;
  readonly routes: {
    readonly dir: string;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
  };
  readonly islands: {
    readonly dir: string;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
  };
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

The next sections walk through each field.

## `root`

The project root. Every other path is resolved relative to this.

```ts
export default defineConfig({ root: "." });
```

A relative value is resolved against the current working directory.
An absolute value is taken as-is. The resolved value is
slash-normalized and stored as an absolute path.

There is no default; `root` is required (in practice: by the time the
loader runs, the framework's CLI has already chosen a working
directory, so the generated config always sets `root: "."`).

## `srcDir`

The source directory. Routes, islands, and the optional global
stylesheet live under this directory.

Default: `"src"`.

## `publicDir`

The public files directory. Static files in this directory are
served at the URL they would have if the project root were the
web root.

Default: `"public"`. Set to `false` to disable public-file serving
entirely (e.g. when serving the app from a CDN that does its own
static-file work).

## `outDir`

The production build output directory. `sprout build` writes the
frozen manifest and the content-hashed assets here. `sprout serve`
reads them.

Default: `".sprout/dist"`.

The production build refuses to empty a non-empty `outDir` unless the
only entry is a prior `sprout.manifest.json`. The error is
`BUILD_OUTDIR_UNSAFE`. See [Security](security.md).

## `routes`

Route discovery config.

```ts
routes: {
  dir: "src/routes",
  include: ["**/*.{ts,tsx}"],
  exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
}
```

- `dir` — the route directory. Default: `"src/routes"`.
- `include` — glob patterns for files to consider as routes.
  Default: `["**/*.{ts,tsx}"]`.
- `exclude` — glob patterns for files to skip. The default skips
  test files (`*.test.{ts,tsx}`) and private helpers (`_*.{ts,tsx}`).

A file that matches the `include` glob and does not match the
`exclude` glob is discovered. The framework maps the relative path
to a URL pattern (see [Routes](routes.md)).

## `islands`

Island discovery config. Same shape as `routes`.

```ts
islands: {
  dir: "src/islands",
  include: ["**/*.{ts,tsx}"],
  exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
}
```

- `dir` — the island directory. Default: `"src/islands"`.
- `include` — default: `["**/*.{ts,tsx}"]`.
- `exclude` — default: `["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"]`.
  The `*.server.*` exclude is a convention for "do not bundle this
  file into the client".

The framework assigns each island a stable id and a canonical public
URL of the form `/@sprout/island/<id>.js`. Two islands with the
same id or the same public URL produce a `DISCOVERY_ISLAND_CONFLICT`
or `MANIFEST_DUPLICATE_ID` error at build time.

## `styles`

The optional global stylesheet.

```ts
styles: { app: "src/styles/app.css" }
```

- `app` — path to the global stylesheet. Default: looks for
  `"src/styles/app.css"` relative to `root`; if the file exists, that
  path is used, otherwise the value is `null`. Set explicitly to
  `false` to disable the global stylesheet, or set to a string to
  override the default location.

When `styles.app` is `null`, the HTML shell does not include a
stylesheet link tag and the framework does not serve a CSS asset.

## `build`

Build-time options.

```ts
build: {
  compress: "gzip",
  sourcemap: true,   // dev default; false in production
  minify: false,     // dev default; true in production
  frozenAssetCache: "none",
}
```

- `compress` — whether to write gzip companions alongside the
  hashed assets. `false` or `"gzip"`. Default: `"gzip"`.
- `sourcemap` — whether to emit `.map` files. The default is mode-driven:
  `true` in development, `false` in production. Production serves do
  not serve source maps even if the build emitted them.
- `minify` — whether to minify the bundled assets. The default is
  mode-driven: `false` in development, `true` in production.
- `frozenAssetCache` — the optional bounded LRU that caches
  production asset bytes. `"none"` (the default) disables the cache;
  `{ kind: "bounded", maxBytes: <n> }` enables it. The cap is in
  bytes, summed across raw + gzip companion bytes for each cached
  entry.

## `server`

Server bind options. Used by `sprout dev` and `sprout serve`.

```ts
server: {
  hostname: "localhost",
  port: 8000,
}
```

- `hostname` — the bind hostname. Default: `"localhost"`.
- `port` — the bind port. Must be an integer in `[1, 65535]`.
  Default: `8000`.

## Path resolution

Every path field is slash-normalized and resolved to an absolute
path before validation. Relative values are joined to `root`; absolute
values are taken as-is. The resolved value must satisfy
`isInsideRoot(resolved, root)` — that is, the resolved path must
either be `root` itself or live strictly inside `root`.

Sibling-prefix escapes are rejected. `outDir: "../outside"` and
`publicDir: "/etc/passwd"` both fail with a `CONFIG_PATH_OUTSIDE_ROOT`
error. The check is relative-path containment, not string-prefix
containment, so `/foo/bar-baz` does NOT contain `/foo/bar` even
though the strings look related.

NUL bytes are rejected everywhere a path crosses the public
boundary. The error is `CONFIG_INVALID_PATH`.

## Validation rules

The full list of validation rules:

- `root` must be a non-empty string. The resolved value must be an
  absolute path.
- Every path field (`srcDir`, `publicDir`, `outDir`, `routes.dir`,
  `islands.dir`, `styles.app`) must be a string (or `false` for
  `publicDir` and `styles.app`). NUL bytes and sibling-prefix
  escapes are rejected.
- `server.port` must be an integer in `[1, 65535]`. A non-integer,
  a non-positive, or an out-of-range value fails with
  `CONFIG_INVALID_PORT`.
- `server.hostname` must be a non-empty string.
- `build.compress` must be `false` or `"gzip"`.
- `build.frozenAssetCache` must be `"none"` or
  `{ kind: "bounded", maxBytes: <positive integer> }`. Any other
  shape fails with `CONFIG_INVALID_CACHE_POLICY`.
- `routes.include` / `routes.exclude` /
  `islands.include` / `islands.exclude` must be non-empty arrays
  of non-empty strings.
- Unknown top-level keys are rejected in strict mode. The error is
  `CONFIG_INVALID_SHAPE`.
- Unknown nested keys (e.g. `routes.foo`) are rejected with the
  same error.

Every error has a stable `code`, a human-readable `message`, and a
`details` object. The full table is in the developer reference:
[Errors](sprout/errors.md).

## `--force` and the dev experience

The config file is loaded once at startup. Changes to
`sprout.config.ts` require a server restart. There is no hot module
replacement for the config in the M9 release; this is a documented
constraint, not a bug.

The dev server does hot-reload route and island source files (the
underlying bundler re-stats the inputs and re-compiles on cache
miss), but the resolved config is treated as immutable for the
lifetime of a process.

## Per-environment overrides

The framework has a `mode` field on `ResolvedConfig`. It is set by
the CLI command (`init` / `dev` run in `"development"`; `build` /
`serve` run in `"production"`; `inspect` runs in `"development"`),
not by the config file. You do not set `mode` in `sprout.config.ts`.

The mode-driven defaults for `build.sourcemap` and `build.minify`
follow from this: the loader sees the mode, picks the right default
for each, and stores the result on the resolved config.

If you need a value that depends on the mode, branch in your own
config file:

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

const isProd = Deno.env.get("SPROUT_MODE") === "production";

export default defineConfig({
  root: ".",
  build: {
    compress: "gzip",
    minify: isProd,
  },
});
```

The CLI does not export `SPROUT_MODE`; the example is illustrative.
In practice the M9 release does not have a documented "read mode in
the config file" hook. If you need one, open an issue and the
post-MVP backlog can pick it up.
