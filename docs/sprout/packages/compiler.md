# Sprout Build Plan

## 5.4 `@sprout/compiler`

### Purpose

`@sprout/compiler` owns discovery, internal manifest construction, validation, virtual modules, dev asset compilation, and production asset freezing.

This package replaces the conceptual responsibilities currently split across build and manifest packages, but the greenfield design should expose one coherent compiler API.

### Public Exports

```ts
export { discoverProject } from "./discover/project.ts";
export { validateManifest } from "./manifest/validate.ts";
export {
  buildProduction,
  compileDevAsset,
  loadFrozenIndex,
  readFrozenAsset,
} from "./build/mod.ts";

export type {
  AssetKind,
  BuildOutput,
  DiscoveredIsland,
  DiscoveredProject,
  DiscoveredRoute,
  FrozenAsset,
  FrozenIndex,
  FrozenManifest,
  Manifest,
  ManifestError,
  RoutePattern,
} from "./manifest/types.ts";
```

### Discovery Output

```ts
export type DiscoveredProject = {
  readonly routes: readonly DiscoveredRoute[];
  readonly islands: readonly DiscoveredIsland[];
  readonly styles: {
    readonly app: string | null;
  };
};

export type DiscoveredRoute = {
  readonly id: string;
  readonly pattern: string;
  readonly file: string;
  readonly kind: "page" | "endpoint" | "mixed";
};

export type DiscoveredIsland = {
  readonly id: string;
  readonly file: string;
  readonly exportName: "default";
  readonly publicPath: string;
};
```

### Internal Manifest

```ts
export type Manifest = {
  readonly version: 1;
  readonly routes: readonly RouteEntry[];
  readonly islands: readonly IslandEntry[];
  readonly styles: {
    readonly app: StyleEntry | null;
  };
};

export type RouteEntry = {
  readonly id: string;
  readonly pattern: string;
  readonly file: string;
};

export type IslandEntry = {
  readonly id: string;
  readonly file: string;
  readonly exportName: "default";
  readonly publicPath: `/@sprout/island/${string}.js`;
};

export type StyleEntry = {
  readonly id: string;
  readonly file: string;
  readonly publicPath: string;
};
```

### Route Pattern Mapping

| File | Pattern |
| --- | --- |
| `src/routes/index.tsx` | `/` |
| `src/routes/about.tsx` | `/about` |
| `src/routes/blog/index.tsx` | `/blog` |
| `src/routes/blog/[slug].tsx` | `/blog/:slug` |
| `src/routes/files/[...path].tsx` | `/files/:path{.+}` |
| `src/routes/(marketing)/index.tsx` | `/` |
| `src/routes/_layout.tsx` | ignored initially |
| `src/routes/_helpers.ts` | ignored |

Initial release should ignore route groups such as `(marketing)` or explicitly reject them. If accepted, they must not affect the URL path.

### Island Public Path Mapping

| File | Public path |
| --- | --- |
| `src/islands/Counter.tsx` | `/@sprout/island/Counter.js` |
| `src/islands/cart/AddButton.tsx` | `/@sprout/island/cart/AddButton.js` |

Rules:

- Public paths are derived from the slash-normalized relative path under `islands.dir`.
- Extensions are replaced with `.js`.
- `.` and `..` segments are rejected.
- Duplicate ids or public paths are manifest errors.
- A route and an island may share a basename because their URL namespaces differ.

### Generated Virtual Island Entry

For each island, the compiler creates a virtual module equivalent to:

```ts
import Component from "file:///absolute/path/to/src/islands/Counter.tsx";
import { mountComponent } from "@sprout/runtime";

export default {
  mount(element: HTMLElement, props: Readonly<Record<string, unknown>>) {
    mountComponent(element, Component, props);
  },
};
```

This wrapper is compiled for the browser with JSX import source `@sprout/jsx/dom`.

### Build Outputs

```ts
export type BuildOutput = {
  readonly js: Uint8Array;
  readonly css?: Uint8Array;
  readonly map?: Uint8Array;
  readonly hash: string;
};

export type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};

export type FrozenAsset = {
  readonly kind: "runtime" | "island" | "style" | "vendor";
  readonly id: string;
  readonly publicPath: string;
  readonly file: string;
  readonly contentType: string;
  readonly hash: string;
  readonly gzipFile?: string;
};
```

### Build Pipeline

Development:

- Discover files at startup.
- Watch mode is optional for MVP; request-time stat invalidation is acceptable.
- Compile runtime on demand.
- Compile island on demand.
- Compile CSS on demand.
- Return sourcemaps when enabled.
- Use single-flight coalescing for concurrent identical compile requests.
- Cache by `{entry, kind, mode, envHash, inputSetHash}`.

Production:

- Empty `outDir` only when safe.
- Refuse to empty a non-empty directory that lacks a prior Sprout manifest.
- Compile runtime.
- Compile shared vendor bundle if needed.
- Compile every island.
- Compile app CSS.
- Write content-hashed files under `_sprout/`.
- Write `sprout.manifest.json`.
- Optionally write `.gz` companions.
- Do not eagerly load frozen asset bytes into memory.

### Asset URL Namespace

Reserved framework URLs:

```text
/@sprout/runtime.js
/@sprout/vendor.js
/@sprout/app.css
/@sprout/island/**
/@sprout/assets/**
```

Public files must not override reserved framework URLs.

### Error Codes

```ts
type CompilerErrorCode =
  | "DISCOVERY_ROOT_MISSING"
  | "DISCOVERY_ROUTE_CONFLICT"
  | "DISCOVERY_ISLAND_CONFLICT"
  | "DISCOVERY_INVALID_ROUTE_FILE"
  | "DISCOVERY_INVALID_ISLAND_FILE"
  | "MANIFEST_DUPLICATE_ID"
  | "MANIFEST_INVALID_PUBLIC_PATH"
  | "MANIFEST_RESERVED_PATH_COLLISION"
  | "BUILD_FAILED"
  | "BUILD_OUTPUT_MISSING"
  | "BUILD_OUTDIR_UNSAFE"
  | "FROZEN_MANIFEST_MISSING"
  | "FROZEN_MANIFEST_UNSUPPORTED";
```

### Dependencies

- `@sprout/config`
- `@sprout/jsx`
- `@sprout/runtime`
- `@sprout/utils`
- `jsr:@std/fs`
- `jsr:@std/path`
- `jsr:@std/media-types`
- esbuild package and Deno/CSS plugins from JSR, pinned at implementation time

### Permissions

Development/build:

```text
--allow-read     source files, config, dependency cache metadata, public files
--allow-write    production outDir, dev cache if enabled
--allow-env      PUBLIC_* defines
--allow-net      only if remote module fetching is delegated to Deno/esbuild plugin and required
```

### Required Tests

Discovery:

- index route maps to `/`.
- dynamic route maps to `/:param`.
- catch-all route maps to `:param{.+}`.
- duplicate route patterns fail.
- duplicate island public paths fail.
- ignored files are ignored.
- paths outside root fail.

Build:

- runtime bundle exists.
- island bundle exists and imports/contains generated wrapper.
- app CSS bundle exists when configured.
- sourcemap exists in development.
- minification changes production output.
- public env values invalidate dev cache.
- transitive input edits invalidate dev cache.
- unsafe outDir is refused.
- gzip companion is written only when enabled.

Frozen serving metadata:

- manifest loads without asset byte reads.
- bounded LRU is optional.
- missing gzip companion degrades to raw asset.

### Done Criteria

- `discoverProject(config)` fully replaces user-authored route/island manifests.
- `buildProduction(config)` can build a non-trivial app with at least one route, one island, CSS, and public assets.
- Compiler APIs are usable from CLI and tests without starting an HTTP server.

---
