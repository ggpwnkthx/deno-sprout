# Build and serve

This guide covers the two production commands:

- `sprout build` — compiles the project, writes content-hashed
  assets, and writes a frozen manifest.
- `sprout serve` — reads the frozen manifest, serves the assets
  with `ETag` / `gzip` / immutable cache headers, and lazy-reads
  asset bytes from disk.

The M9 release treats the production serve path as the primary
performance contract. The dev pipeline is a different story (see
[Internals](internals.md)); this page is about the production path.

## The build

`sprout build` runs `buildProduction` from `@sprout/compiler`. The
pipeline is:

1. Resolve the config (load `sprout.config.ts`, fill in defaults).
2. Discover the project (walk `src/routes/` and `src/islands/`,
   apply include / exclude globs).
3. Validate the manifest (catch duplicate patterns, duplicate
   island ids, etc.).
4. Assert the `outDir` is safe to empty (a missing directory is
   fine; an existing one is fine if it is empty or contains only a
   prior `sprout.manifest.json`).
5. Compile the runtime (`/@sprout/runtime.js`).
6. Compile the global stylesheet, if any (`/@sprout/app.css`).
7. Compile every island, starting from a generated virtual entry
   that imports the user's island component and wraps the default
   export in a `{ mount(element, props) }` function.
8. Write the hashed files into `<outDir>/_sprout/`.
9. Write the gzip companions when `build.compress === "gzip"`.
10. Write the frozen manifest to `<outDir>/sprout.manifest.json`.
11. Print a concise summary.

The summary looks like this:

```text
Built 3 assets into .sprout/dist
  runtime  /@sprout/runtime.js                 (+gzip)
  style    /@sprout/app.css                    (+gzip)
  island   /@sprout/island/Counter.js          (+gzip)
```

The `+gzip` annotation is the only line-level detail; the summary
is intentionally short.

### Output layout

The on-disk layout of `<outDir>/` after a successful build:

```text
.sprout/dist/
  sprout.manifest.json                # the frozen manifest
  _sprout/
    runtime.<hash16>.js              # /@sprout/runtime.js
    runtime.<hash16>.js.gz           # (when build.compress === "gzip")
    style-app.<hash16>.css           # /@sprout/app.css
    style-app.<hash16>.css.gz
    island-Counter.<hash16>.js       # /@sprout/island/Counter.js
    island-Counter.<hash16>.js.gz
    # ... one entry per discovered island
```

The hash is the first 16 characters of the SHA-256 of the
content. The full hash is in the frozen manifest; the on-disk
filename carries the 16-character prefix so it is short enough to
eyeball but long enough that collisions are practically
impossible.

The gzip companions are written with a `.gz` suffix that is part of
the original extension. `runtime.<hash16>.js` is paired with
`runtime.<hash16>.js.gz`. The manifest knows the exact mapping.

### Frozen manifest

The frozen manifest is the canonical record of what the build
produced. It is the only artifact the serve step reads at startup
(other than the asset files themselves).

The full shape is in [Internals](internals.md). The summary:

```ts
type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};

type FrozenAsset = {
  readonly kind: "runtime" | "island" | "style";
  readonly id: string;
  readonly publicPath: string;
  readonly file: string;     // relative to <outDir>
  readonly contentType: string;
  readonly hash: string;
  readonly gzipFile: string | null;  // relative to <outDir>, null when no companion
};
```

The manifest is validated at load time. A wrong version, a missing
field, a duplicate `publicPath`, or a path containing `..` / NUL
bytes all fail with `FROZEN_MANIFEST_UNSUPPORTED`. See
[Security](security.md).

## The serve

`sprout serve` runs the production HTTP server against the frozen
manifest. The contract is:

- Read the frozen manifest once at startup.
- Build a `Map<publicPath, FrozenAssetMetadata>` in O(n) where
  `n` is the number of assets. Every request is then an O(1) lookup
  against this map.
- Do not eagerly read asset bytes. The first byte of an asset is
  read on the first request that needs it.
- Serve raw or gzip bytes based on `Accept-Encoding`.
- Set `ETag` from the content hash.
- Return `304 Not Modified` on matching `If-None-Match`.
- Set `cache-control: public, max-age=31536000, immutable` on
  framework assets (the filenames are content-hashed, so the
  content is genuinely immutable from the browser's perspective).
- Set `cache-control: public, max-age=3600` on `public/` files.
- Render server routes from source. The M9 release does not bundle
  server routes; the runtime import is identical to the dev path.

The serve command reads `<outDir>/sprout.manifest.json` and the
asset bytes from disk. It does not run a build step; if you want to
ship a new build, run `sprout build` first.

### ETag

Every framework asset has an `ETag` derived from the content hash.
The `ETag` is a quoted string in the standard
`ETag: "<hash>"` shape, where `<hash>` is the full SHA-256 hex
digest of the asset's bytes (the same hash that appears in the
frozen manifest, minus the 16-character truncation that the
filename uses).

A request with `If-None-Match: "<hash>"` returns `304 Not Modified`
with no body. The 304 response carries the same `ETag`, the
`cache-control`, and the `Vary: Accept-Encoding` header as the
200 response; it omits the body and the `Content-Length`.

### gzip

The `Vary: Accept-Encoding` header is set on every framework asset
response, so HTTP caches correctly key on the negotiated encoding.

`Accept-Encoding: gzip` returns the gzip companion bytes with
`Content-Encoding: gzip`. `gzip;q=0` (or no `Accept-Encoding` header)
returns the raw bytes. The framework does not compress on the fly
in the M9 release; the gzip companion bytes are pre-built at
compile time and streamed verbatim. A request that asks for an
encoding the build did not produce (e.g. `br` or `deflate`) returns
the raw bytes.

When the build runs without `build.compress: "gzip"`, the gzip
companions do not exist. The serve path still negotiates
`Accept-Encoding`; the `Accept-Encoding: gzip` case falls back to
the raw bytes with no `Content-Encoding` header.

### Cache headers

Framework assets (everything served under `/@sprout/`) get:

```text
cache-control: public, max-age=31536000, immutable
```

`max-age=31536000` is one year in seconds. The `immutable` token is
the explicit promise to the browser: "this asset's URL will never
re-serve different bytes". It is safe to set because the filenames
are content-hashed; a new build produces a new filename.

Public files (everything served from `public/`) get:

```text
cache-control: public, max-age=3600
```

One hour is a sensible default for "user-authored static content
that might be re-uploaded". A CDN that does its own cache-control
logic should override this header.

The HTML shell response itself does not get a long cache. The
HTML shell includes the runtime script tag, the stylesheet tag,
and the island placeholders; those are the user's entry point and
the server controls their freshness directly.

### No preload

The serve path does not read all asset bytes at startup. The
`/sprout/dist/_sprout/` directory may contain hundreds of files
for a large project; preloading them all would pin the resident
memory to a number that scales with the build size, not with the
request rate.

The serve path reads a single asset on the first request that
needs it, and (if the optional bounded LRU is enabled) caches it
up to the configured cap. See the next section.

### The optional bounded LRU

Production asset byte caching is **opt-in and bounded**. Set:

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
  build: {
    frozenAssetCache: { kind: "bounded", maxBytes: 32 * 1024 * 1024 }, // 32 MiB
  },
});
```

The LRU holds `{ rawBytes, gzipBytes }` pairs keyed on
`publicPath`. The byte-size reported to the cache is the sum of
the raw + gzip companion sizes for each entry, so a 100 KB
JavaScript asset with a 30 KB gzip companion reports 130 KB to
the LRU. A `maxBytes` of `32 * 1024 * 1024` therefore caps the
resident-memory footprint of the cache at 32 MiB, regardless of
the total size of the build.

The default is `"none"` (no LRU). Every request reads from disk
in that case. This is the right default for a small app: disk
reads are fast and the resident memory stays bounded by the
number of in-flight requests, not by the build size.

The LRU is the only place in the production serve path that
holds asset bytes in memory across requests. The M9 release does
not have any other byte cache.

## Required permissions

The full per-command Deno permission table is in
[Permissions](sprout/permissions.md). The summary for the build
and serve commands:

| Command       | Permissions                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `sprout build`| `--allow-read`, `--allow-write`, `--allow-env`                                               |
| `sprout serve`| `--allow-read`, `--allow-env`, `--allow-net`                                                 |

The generated `deno.jsonc` from `sprout init` sets these flags on
the matching `deno task` lines. A Deno Deploy entrypoint uses the
`serve` task's flags; a `Dockerfile` that runs the build in stage
1 uses the `build` task's flags.

## Performance notes

A few things that are worth knowing about the production serve
path:

- **Cold start is one manifest read.** A `sprout serve` boot reads
  exactly one file from disk: `<outDir>/sprout.manifest.json`.
  The asset bytes are not read until the first request.
- **Per-request work is O(1) in the manifest index.** A typical
  request looks up the public path in a `Map`, optionally reads
  the bytes from disk (or the LRU), and returns. There is no
  per-request compilation, no per-request directory walk, no
  per-request glob.
- **ETag checks are zero-disk.** An `If-None-Match` request that
  matches the manifest's hash returns 304 without reading the
  bytes.
- **The HTML shell response itself is the slowest part of a cold
  start.** The first request for a route is a dynamic import of
  the route module; the M9 release does not pre-bundle server
  routes. The cost is amortized by the server's module cache.

The dev pipeline is documented separately; see
[Internals](internals.md).
