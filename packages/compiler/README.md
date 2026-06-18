# @sprout/compiler

Route / island / style discovery, internal manifest construction, on-demand dev asset compilation,
and content-hashed production build with a frozen manifest.

`@sprout/compiler` is the framework's compiler. It owns everything between the user's source files
and the bytes the runtime serves: the filesystem walks that turn `src/routes` and `src/islands` into
a typed `Manifest`, the validator that catches duplicate ids and reserved-path collisions, the
on-demand dev compile pipeline (esbuild + @ggpwnkthx/esbuild-plugin-deno with a single-flight
cache), the production build (content-hashed assets under `<outDir>/_sprout/`, the
`sprout.manifest.json` writer, optional `.gz` companions), and the frozen-manifest readers the
production serve uses to look up assets in O(1).

## Public surface

### Discovery

- `discoverProject(config)` — run route, island, and stylesheet discovery in parallel and combine
  them with the resolved stylesheet path. Returns a `DiscoveredProject`.
- `discoverIslands(config)` — discover all island files in the project. Returns the list sorted by
  `id`; duplicate `publicPath` values throw `DISCOVERY_ISLAND_CONFLICT`.
- `discoverRoutes(config)` — discover all route files in the project. Returns the list sorted by
  `pattern`; duplicate patterns throw `DISCOVERY_ROUTE_CONFLICT`.
- `validateManifest(project)` — convert a `DiscoveredProject` into the internal `Manifest`. Re-runs
  the duplicate checks as defense in depth and rejects public paths that escape the canonical
  `/@sprout/island/<id>.js` template.
- `formatDiscoveredProject(project)` — render a `DiscoveredProject` as a human-readable multi-line
  string. Used by the CLI's `inspect` command.
- `formatManifest(manifest)` — same shape as `formatDiscoveredProject` but typed against the
  internal `Manifest`.

### Path mapping

- `globToRegExp(pattern)` — re-export of `@std/path`'s glob helper. Used internally; re-exported so
  consumers can reproduce the walker's behavior.
- `routeFileToPattern(relativePath)` — map a route file's slash-normalized relative path (extension
  stripped) to a Hono route pattern. Returns `null` for private helpers (leading underscore
  segments) so the caller can skip them.
- `islandFileToPublicPath(relativePath)` — map an island file's slash-normalized relative path to
  its canonical `/@sprout/island/<id>.js` public URL. Throws `MANIFEST_INVALID_PUBLIC_PATH` on
  dot-segments or NUL bytes.
- `isReservedAssetPath(publicPath)` — `true` for any public path that lives under the reserved
  `/@sprout/` framework URL namespace.
- `RESERVED_ASSET_PREFIX` — the `/@sprout/` prefix string. Re-exported so consumers can build their
  own checks.
- `matchesDiscoveryGlobs(relativePath, include, exclude)` — apply the include / exclude globs from a
  discovery config to a relative path.

### Build

- `buildProduction({ config })` — run the production build. Compiles the runtime, every island, and
  (when configured) the app stylesheet via `compileDevAsset` with `mode: "production"`, writes the
  content-hashed files under `<outDir>/_sprout/`, writes `<outDir>/sprout.manifest.json`, and
  returns a typed `BuildSummary`.
- `formatBuildSummary(summary)` — format a `BuildSummary` as the human-readable multi-line string
  the CLI prints after a build.
- `compileDevAsset(input)` — compile a single dev asset (runtime, island, or style). Uses a
  process-local `SingleFlightCache` keyed on `(entry, kind, id, mode, envHash)`; on a hit the cache
  re-stats the recorded input set before serving.
- `compileDevSourceMap(input)` — return the source map for a single dev asset, or `null` when the
  asset did not produce a map. Used by the dev server's `/@sprout/<asset>.js.map` routes.
- `loadFrozenIndex(outDir)` — load the frozen manifest and return an O(1) `publicPath → FrozenAsset`
  index. A missing manifest throws `FROZEN_MANIFEST_MISSING`; a malformed manifest throws
  `FROZEN_MANIFEST_UNSUPPORTED`.
- `readFrozenAsset(index, publicPath)` — read a single frozen asset's bytes (raw and optionally
  gzip). The caller passes a pre-built `FrozenIndex` (typically held in a closure for the lifetime
  of the serve loop). The function reads the on-disk file using the index's `outDir` and asset
  metadata. A missing gzip companion degrades to `null` (with a `console.warn`) per the M7 spec.
- `readFrozenAssetFromOutDir(outDir, publicPath)` — thin convenience wrapper that calls
  `loadFrozenIndex` then `readFrozenAsset`. Use this when you have an `outDir` and a one-shot read
  (CLI tools, tests). The serve layer should build the index once and pass it directly to
  `readFrozenAsset`.
- `resolveIslandEntryFile(id, root)` — resolve the on-disk path of an island source file given its
  slash-normalized id and a project root. Returns `null` when neither `<id>.tsx` nor `<id>.ts`
  exists.
- `resolveRuntimeEntryFile()` — resolve the absolute path to the browser runtime entry file
  (`@sprout/runtime/runtime_entry.ts`) that is bundled as `/@sprout/runtime.js`.

### Types

- `BuildOptions` — the input shape for `buildProduction`.
- `BuildSummary` — the structured result of a successful build. Includes the `manifest`, the
  `outDir`, the asset count, the gzip-companion count, and the total raw bytes written.
- `AssetKind` — the closed set of asset kinds the dev pipeline compiles:
  `"runtime" | "island" | "style"`.
- `CompileDevAssetInput` — the input shape for `compileDevAsset`.
- `CompileDevAssetResult` — the result shape for `compileDevAsset`.
- `ReadFrozenAssetResult` — the result shape for `readFrozenAsset`.
- `BuildOutput` — the raw bytes of a single compile step plus the content hash. `buildProduction`
  aggregates these into `FrozenAsset` entries.
- `DiscoveredProject` — discovery output for a whole project.
- `DiscoveredRoute` — a route file discovered on disk.
- `DiscoveredIsland` — an island file discovered on disk.
- `Manifest` — the internal in-memory manifest (`version: 1`).
- `RouteEntry`, `IslandEntry`, `StyleEntry` — the entry types inside the internal `Manifest`.
- `FrozenManifest` — the on-disk manifest written by `buildProduction` to
  `<outDir>/sprout.manifest.json`.
- `FrozenAsset` — a single on-disk asset entry.
- `FrozenAssetKind` — the closed union of asset kinds (`"runtime" | "island" | "style" | "vendor"`).
- `FrozenIndex` — the production-serve in-memory index; an O(1) `publicPath → FrozenAsset` map plus
  the source `outDir`.
- `RoutePattern` — a route pattern string (Hono-flavored syntax).
- `ManifestError` — a typed error reported by manifest construction.
- `CompilerError` — the typed error class. `code` is one of `CompilerErrorCode`; `details` is a
  frozen, JSON-serializable object.
- `CompilerErrorCode` — the closed union of stable error codes: `DISCOVERY_ROOT_MISSING`,
  `DISCOVERY_ROUTE_CONFLICT`, `DISCOVERY_ISLAND_CONFLICT`, `DISCOVERY_INVALID_ROUTE_FILE`,
  `DISCOVERY_INVALID_ISLAND_FILE`, `DISCOVERY_INVALID_STYLE_FILE`, `MANIFEST_DUPLICATE_ID`,
  `MANIFEST_INVALID_PUBLIC_PATH`, `MANIFEST_RESERVED_PATH_COLLISION`, `BUILD_FAILED`,
  `BUILD_OUTPUT_MISSING`, `BUILD_OUTDIR_UNSAFE`, `FROZEN_MANIFEST_MISSING`,
  `FROZEN_MANIFEST_UNSUPPORTED`, `FROZEN_ASSET_TOO_LARGE`.

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Internals](https://jsr.io/@sprout/core) — the framework internals doc, which describes the
  manifest shape and the asset pipeline in detail.

## License

MIT
