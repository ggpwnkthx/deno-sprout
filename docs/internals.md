# Internals

This page is the single document that shows the manifest shape, the
asset pipeline, the dev-vs-prod split, and the virtual island entry
generation. Most users do not need to read this; the user-facing
docs link here when the answer to "why does it do that?" is "because
of the manifest".

If you are trying to understand *what* the framework is doing, read
this. If you are trying to use the framework, you can ignore this.

## The manifest

The framework has two manifest shapes: the in-memory `Manifest` and
the on-disk `FrozenManifest`. The in-memory shape is what the dev
server works with; the on-disk shape is what `sprout build` writes
and `sprout serve` reads.

### In-memory manifest

```ts
type Manifest = {
  readonly version: 1;
  readonly routes: readonly RouteEntry[];
  readonly islands: readonly IslandEntry[];
  readonly styles: {
    readonly app: StyleEntry | null;
  };
};

type RouteEntry = {
  readonly id: string;
  readonly pattern: string;
  readonly file: string;
  readonly kind: "page" | "endpoint" | "mixed";
};

type IslandEntry = {
  readonly id: string;
  readonly file: string;
  readonly publicPath: string;
};

type StyleEntry = {
  readonly id: string;
  readonly file: string;
};
```

This is the structure `discoverProject` returns. The dev server
uses it to register the framework asset routes and the per-route
handlers.

### Frozen manifest

The on-disk manifest is what `sprout build` writes to
`<outDir>/sprout.manifest.json`. It is the only artifact `sprout
serve` reads at startup (besides the asset bytes themselves).

```ts
type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};

type FrozenAsset = {
  readonly kind: "runtime" | "island" | "style";
  readonly id: string;
  readonly publicPath: string;
  readonly file: string;        // path relative to <outDir>
  readonly contentType: string;
  readonly hash: string;        // full SHA-256 hex digest
  readonly gzipFile: string | null;  // path relative to <outDir>, null when no companion
};
```

A typical `sprout.manifest.json` for the basic example looks like:

```json
{
  "version": 1,
  "assets": [
    {
      "kind": "runtime",
      "id": "runtime",
      "publicPath": "/@sprout/runtime.js",
      "file": "_sprout/runtime.0123456789abcdef.js",
      "contentType": "text/javascript; charset=utf-8",
      "hash": "0123456789abcdef...",
      "gzipFile": "_sprout/runtime.0123456789abcdef.js.gz"
    },
    {
      "kind": "island",
      "id": "Counter",
      "publicPath": "/@sprout/island/Counter.js",
      "file": "_sprout/island-Counter.0123456789abcdef.js",
      "contentType": "text/javascript; charset=utf-8",
      "hash": "fedcba9876543210...",
      "gzipFile": "_sprout/island-Counter.fedcba9876543210.js.gz"
    },
    {
      "kind": "style",
      "id": "app",
      "publicPath": "/@sprout/app.css",
      "file": "_sprout/style-app.abcdef0123456789.css",
      "contentType": "text/css; charset=utf-8",
      "hash": "abcdef0123456789...",
      "gzipFile": "_sprout/style-app.abcdef0123456789.css.gz"
    }
  ]
}
```

The `version` field is the loader's first check. The `assets`
array is sorted for determinism (the loader does not rely on the
order; sorting is purely for stable diffs). The `file` and
`gzipFile` paths are slash-normalized and contain no leading `./`.

### Why a manifest

The manifest decouples public URLs from on-disk filenames. A route
that imports `import Counter from "../islands/Counter.tsx"` in
source has no idea what the public URL of the bundled island is
going to be; the framework's compiler assigns it
`/@sprout/island/Counter.js` and the manifest records the
content-hashed file that the URL maps to.

The decoupling buys two things:

1. **Stable public URLs.** The HTML shell always references
   `/@sprout/island/Counter.js`. The asset bytes behind that URL
   change when the content changes, but the URL never does.
2. **O(1) lookup at serve time.** The serve path's hot loop is
   `manifest.assets.get(publicPath) → bytes`. No directory walk,
   no glob, no cache invalidation logic.

The frozen manifest is also the audit trail. The build's output
is reproducible from the source: the manifest names every file
that the build produced, and the hashes let you verify that
"what the build wrote" matches "what the serve path is serving".

## The asset pipeline

The dev and production pipelines share the same compiler
(esbuild + the Deno loader plugin from `@luca/esbuild-deno-loader`)
and the same on-disk conventions. They differ in three places:
cache headers, on-disk layout, and how the asset bytes are produced.

### Dev: on-demand compile

The dev pipeline is "compile on demand, cache, serve". The
flow:

1. The framework receives a request for an asset URL (e.g.
   `GET /@sprout/island/Counter.js`).
2. The dev pipeline checks a single-flight cache keyed on (entry,
   kind, mode, env hash, input set hash).
3. On a cache hit, the cached output is returned without
   re-compiling.
4. On a cache miss, esbuild runs, with the Deno loader plugin
   resolving `jsr:` and `https:` modules and emitting the
   browser-side JS.
5. The output is stored in the single-flight cache. The next
   request for the same asset returns the cached output.
6. The response sets `cache-control: no-store` so the browser
   does not cache the dev asset.

The on-disk cache lives in `$TMPDIR/sprout-virtual-entries/`. The
cache is keyed so a stale cache (after a server restart) does not
produce stale responses: the input paths are re-stated before
returning the cached output, and a content change invalidates the
key.

### Production: one-shot, frozen

The production pipeline is "build once, serve forever". The
flow:

1. `sprout build` runs the same esbuild + Deno loader pipeline
   once per asset, against the entire project.
2. Each asset's bytes are hashed (SHA-256), prefixed with the
   first 16 hex characters of the hash, and written to
   `<outDir>/_sprout/`.
3. Gzip companions are written next to the raw bytes when
   `build.compress === "gzip"`.
4. The frozen manifest is written to `<outDir>/sprout.manifest.json`.
5. `sprout serve` reads the manifest once at startup and serves
   the assets. The asset bytes are read on demand; an optional
   bounded LRU caches them across requests.

The production build does not re-run on a request. There is no
file watcher in the M9 release. The only way to pick up a new
build is to restart the serve process.

### Discovery

The compiler walks two directories:

- `src/routes/**` for routes. The default `routes.include` glob is
  `**/*.{ts,tsx}`; the default `routes.exclude` glob is
  `**/*.test.{ts,tsx}, **/_*.{ts,tsx}`.
- `src/islands/**` for islands. The default `islands.include` glob
  is `**/*.{ts,tsx}`; the default `islands.exclude` glob is
  `**/*.server.{ts,tsx}, **/*.test.{ts,tsx}`.

The route walker uses `@std/path`'s `globToRegExp` with the
default options (`extended: true`, `globstar: true`). The
`routeFileToPattern` and `islandFileToPublicPath` helpers map each
relative path to a URL pattern or a public path.

The route file → URL pattern table:

| File                              | URL pattern              |
| --------------------------------- | ------------------------ |
| `index.tsx`                       | `/`                      |
| `about.tsx`                       | `/about`                 |
| `blog/index.tsx`                  | `/blog`                  |
| `blog/[slug].tsx`                 | `/blog/:slug`            |
| `files/[...path].tsx`             | `/files/:path{.+}`       |
| `(marketing)/index.tsx`           | `/`                      |
| `_helpers.ts`                     | (skipped)                |
| `foo.test.tsx`                    | (skipped)                |

The island file → public path table:

| File                          | Public path                          |
| ----------------------------- | ------------------------------------ |
| `Counter.tsx`                 | `/@sprout/island/Counter.js`         |
| `cart/AddButton.tsx`          | `/@sprout/island/cart/AddButton.js`  |

Two islands with the same public path produce a
`DISCOVERY_ISLAND_CONFLICT` error at build time. The manifest
validator catches the same conflict independently as a defense in
depth.

## The virtual island entry

For each island, the compiler generates a small TypeScript file
that imports the user's island component and wraps the default
export in a `{ mount(element, props) }` function. The user never
sees or writes this file. The file is written to
`$TMPDIR/sprout-virtual-entries/` in dev mode and to
`<outDir>/_sprout/` in production.

The shape of a generated entry, simplified:

```ts
// Generated. Do not edit.
import { mountComponent } from "@sprout/runtime";
import Counter from "<absolute path to the user's Counter.tsx>";

export const mount = (
  element: HTMLElement,
  props: Readonly<Record<string, unknown>>,
) => {
  return mountComponent(
    element,
    Counter as (props: Readonly<Record<string, unknown>>) => unknown,
    props,
  );
};
```

The generated entry is compiled with
`jsxImportSource: "@sprout/jsx/dom"` (the DOM JSX runtime), so the
island component renders into a real browser DOM. The server
JSX runtime, by contrast, intercepts the same component and emits
the placeholder; the dev path also does the interception in dev
mode so the same `Counter` component is used on both sides.

The virtual entry is the only place that imports
`@sprout/runtime` from user code. It is also the only place that
imports the user's island component from a server-side context
into a browser-side bundle.

## Dev vs production

A short side-by-side of the two modes:

| Aspect              | Dev                                  | Production                              |
| ------------------- | ------------------------------------ | --------------------------------------- |
| Asset compilation   | On-demand, single-flight cache       | One-shot, content-hashed                |
| Cache headers       | `no-store`                           | `public, max-age=31536000, immutable`   |
| Source maps         | Served at `<asset>.js.map`           | Not emitted (default)                   |
| Gzip                | Not emitted                          | Emitted when `build.compress === "gzip"`|
| Manifest            | In-memory `Manifest`                 | On-disk `FrozenManifest`                |
| Server route bundling | None (dynamic import)              | None (dynamic import)                   |
| Cold start          | Compile on first request             | Read manifest, no compilation           |
| Restart to pick up config changes | Required                | Required                                |

The M9 release does not pre-bundle server routes in either mode.
A future milestone can add server route bundling without changing
the dev / production split.

## Why the framework owns all of this

The whole point of the manifest, the virtual entry, and the
content-hashed asset pipeline is that the user writes five
files (a config, a route, an island, a stylesheet, a public file)
and the framework turns those five files into a working,
production-served, content-hashed, gzip-compressed, ETag-validating
HTTP server.

If you find yourself wanting to opt out of any of this, that is
usually a signal that you are working against the framework rather
than with it. The escape hatches (`build.frozenAssetCache: "none"`,
`publicDir: false`, `build.compress: false`) are intentional; the
generated wrappers (the virtual entry, the manifest, the asset
URLs) are not user-editable.

## M10 release notes

M10 is the release-candidate milestone. The first publishable JSR
release. Every package passes `deno publish --dry-run`; the
generated app passes the dev + production smoke tests; the public
API surface is documented in each package's `README.md`. Per-package
`deno.jsonc` files carry a `description`, a `license`, and a
`publish.exclude` list that keeps tests, dev-only helpers, and
CI / editor files out of the published tarball. The top-level
[CHANGELOG.md](../CHANGELOG.md) tracks the per-milestone release
notes; the M10 entry is the release-candidate notes. The end-to-end
smoke lives at `scripts/smoke.ts` and runs as `deno task smoke`;
the publish dry-run is `deno task publish-check`. The
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml)
file is the 7-package matrix that wires the actual `deno publish`
step to a `v*` tag push.
