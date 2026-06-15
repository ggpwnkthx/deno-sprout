# Sprout

A Deno-first, JSR-only TypeScript framework for SSR + islands.

This repository is at M10 — Release Candidate. M0 through M9 are done. The framework is
release-candidate: every package passes `deno publish --dry-run`, the generated app passes the dev +
production smoke tests, and the public API surface is documented in each package's `README.md`. The
first JSR release is the M10 tag.

## M10 packages with public API

| Package            | Role                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sprout/core`     | Server app: `createApp`, `serve`, route dispatch, HTML shell, public file serving, on-demand dev asset pipeline, and frozen-manifest production asset serve.                                          |
| `@sprout/cli`      | Command-line UX, project scaffolding, command orchestration. Pure `run(argv)` returns a `CliResult`.                                                                                                  |
| `@sprout/compiler` | Discovery, manifest validation, `compileDevAsset` (esbuild + single-flight cache), `buildProduction` (content-hashed outDir + frozen manifest + optional gzip), `loadFrozenIndex`, `readFrozenAsset`. |
| `@sprout/jsx`      | Server JSX runtime with island placeholder interception, plus the `dom` and `shared` subpaths.                                                                                                        |
| `@sprout/runtime`  | Browser-only island mounting: `mountAll`, `mountIsland`, `mountComponent`, and the typed contract for island modules.                                                                                 |

The remaining `@sprout/config` / `@sprout/utils` packages expose shared helpers (`acceptsGzip`,
`isInsideRoot`, `slash`, `FrameworkError`).

## Packages

| Package                                           | Role                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`@sprout/core`](packages/core/README.md)         | Primary public server package: HTTP app, route rendering, asset serving.                         |
| [`@sprout/cli`](packages/cli/README.md)           | Command-line UX, project scaffolding, command orchestration.                                     |
| [`@sprout/config`](packages/config/README.md)     | Defines and validates the project configuration contract.                                        |
| [`@sprout/compiler`](packages/compiler/README.md) | Discovery, internal manifest, dev and production asset pipeline, and the frozen-manifest reader. |
| [`@sprout/jsx`](packages/jsx/README.md)           | Server and browser JSX runtimes, island placeholder emission.                                    |
| [`@sprout/runtime`](packages/runtime/README.md)   | Browser-only island mounting, placeholder scanning, prop validation.                             |
| [`@sprout/utils`](packages/utils/README.md)       | Shared helpers: paths, gzip negotiation, base error type.                                        |

## Compatibility

- Deno: v2.8 or later. The workspace targets the v2.8 baseline; the development environment uses
  Deno v2.8.3.
- Runtime: Deno-native. No Node.js APIs in any package.
- JSR: each package declares a JSR name (`@sprout/core`, `@sprout/cli`, `@sprout/config`,
  `@sprout/compiler`, `@sprout/jsx`, `@sprout/runtime`, `@sprout/utils`).
- Permissions: see [`docs/sprout/permissions.md`](docs/sprout/permissions.md).

## Tasks

```sh
deno task check         # type-check every package entry point
deno task test          # run workspace tests
deno task fmt           # format the workspace
deno task lint          # lint the workspace
deno task ci            # fmt --check, lint, check, test
deno task smoke         # end-to-end smoke against a generated app
deno task publish-check # deno publish --dry-run for all 7 packages
```

## Status

M0 through M10 done. The framework is release-candidate: every package passes
`deno publish --dry-run`, the generated app passes the dev + production smoke tests, and the public
API surface is documented in each package's `README.md`. The first JSR release is the M10 tag.

The CLI ships `init` (scaffolds a runnable app), `dev` (boots the dev server), `build`
(`buildProduction` — content-hashed output, `sprout.manifest.json`, optional `.gz` companions),
`serve` (M7 production serve — frozen manifest, `ETag` / `gzip` / immutable cache headers, lazy
asset byte reads, optional bounded LRU), `inspect` (prints the resolved config and the discovered
manifest), and `help`. `init` → `dev` is the M5 exit-criterion proof; `build` → written
`.sprout/dist` is the M6 exit-criterion proof; `build` → `serve` → `If-None-Match: 304`, `gzip;q=0`
→ raw bytes, startup preloads no asset bytes is the M7 exit-criterion proof; the path-traversal and
public-URL-collision test surface, the props-size boundary tests, the malformed config / route /
island test surface, and the per-package error-code / per-command Deno-permission docs are the M8
exit-criterion proof; the user-facing docs and the five example apps are the M9 exit-criterion
proof. The M10 deliverable is the JSR-publishable package shape (per-package `deno.jsonc` with
`description`, `license`, `exclude`; per-package `README.md`; top-level `CHANGELOG.md`), the
end-to-end smoke (`deno task smoke`), and the `deno publish --dry-run` gate
(`deno task publish-check`).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the per-milestone release notes.

## Releasing

The release process is automated through
[`.github/workflows/publish.yml`](.github/workflows/publish.yml). On a `v*` tag push, the `ci` job
runs `deno task ci`, `deno task
smoke`, and `deno task publish-check`. The `publish` job then runs
`deno publish` against each of the 7 workspace packages (`packages/utils`, `packages/config`,
`packages/compiler`, `packages/jsx`, `packages/runtime`, `packages/core`, `packages/cli`). The
actual `deno publish` step is not a dry-run; the dry-run is enforced in the `ci` job so a broken
release fails the workflow without ever reaching JSR.

## Documentation

- [Documentation index](docs/index.md) — every doc in one place.
- [Getting started](docs/getting-started.md) — from `sprout init` to a running app in 5 minutes.
- [Routes](docs/routes.md) — file conventions, method exports, dynamic and catch-all routes, route
  groups.
- [Islands](docs/islands.md) — the island contract, the mount loop, what is NOT needed.
- [Config](docs/config.md) — every `ResolvedConfig` field, defaults, and validation.
- [Build and serve](docs/build-and-serve.md) — `sprout build` output, `sprout serve` with the frozen
  manifest, ETag / gzip / immutable cache.
- [Deployment](docs/deployment.md) — Deno Deploy, a VPS, or a container.
- [Security](docs/security.md) — path / URL / props / `outDir` rules.
- [Internals](docs/internals.md) — the manifest shape, the asset pipeline, the virtual island entry.

## Reference docs

- [Permissions](docs/sprout/permissions.md) — per-command Deno permission table with rationale.
- [Errors](docs/sprout/errors.md) — per-package error code table with where-thrown and what-means.
