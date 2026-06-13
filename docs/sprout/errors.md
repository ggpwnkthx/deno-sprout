# Error Codes

Sprout throws typed errors at every public failure boundary. Each error
extends `FrameworkError<Code>` from `@sprout/utils` and carries a
`code`, a `message`, and a `details` object. The `code` is a closed
union per package; adding a new code is a public API change.

The CLI's `--debug` flag prints the stack trace for non-`FrameworkError`
errors. `FrameworkError`s are always printed with their `code` and
`details` (no stack trace; the message + details is the truth).

The tables below enumerate every code in the workspace. Each code is
defined in the package's `errors.ts` (the `Code` type) and thrown at
exactly the documented call site.

## `@sprout/utils`

The package only exports the `FrameworkError` base class; it has no
error codes of its own. The other packages extend it.

## `@sprout/config`

| Code                        | Where                | What it means                                                                                                                |
| --------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CONFIG_IMPORT_FAILED`      | `loadConfig`         | The `sprout.config.ts` file exists but failed to import (parse error, runtime error, no default export). `details.path` is the config file path. |
| `CONFIG_INVALID_SHAPE`      | `resolveConfig`, `loadConfig` | The config object has an unexpected shape — wrong type for a field, unknown top-level or nested key, an array where an object is expected, etc. `details` carries the field name (when applicable). |
| `CONFIG_INVALID_PATH`       | `resolveConfig`      | A path-bearing field (`srcDir`, `publicDir`, `outDir`, `routes.dir`, `islands.dir`, `styles.app`) is not a string, has a NUL byte, or has a wrong type. `details.field` is the offending field name. |
| `CONFIG_PATH_OUTSIDE_ROOT`  | `resolveConfig`      | A path-bearing field resolves to a path outside `config.root`. The config layer refuses sibling-prefix escapes. `details` carries the offending path and the root. |
| `CONFIG_INVALID_PORT`       | `resolveConfig`      | `server.port` is not an integer in `[1, 65535]`. `details.field` and `details.value` are the field name and the bad value (stringified). |
| `CONFIG_INVALID_CACHE_POLICY`| `resolveConfig`      | `build.frozenAssetCache` has an invalid `kind` (not `"bounded"`) or a non-positive-integer `maxBytes`. `details` carries the offending `actual` value. |

## `@sprout/compiler`

| Code                            | Where                                          | What it means                                                                                                  |
| ------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DISCOVERY_ROOT_MISSING`        | (reserved; load step fails first)              | The project root is missing on disk.                                                                          |
| `DISCOVERY_ROUTE_CONFLICT`      | `discoverRoutes`, `validateManifest`           | Two route files map to the same URL pattern. `details.files` lists the conflicting files.                     |
| `DISCOVERY_ISLAND_CONFLICT`     | `discoverIslands`, `validateManifest`          | Two islands share the same `publicPath`. `details.files` (or `details.publicPath` on the validator) lists the entries. |
| `DISCOVERY_INVALID_ROUTE_FILE`  | `discoverRoutes`                               | A route file does not end in `.ts` or `.tsx`.                                                                 |
| `DISCOVERY_INVALID_ISLAND_FILE` | `discoverIslands`                              | An island file does not end in `.ts` or `.tsx`.                                                               |
| `MANIFEST_DUPLICATE_ID`         | `validateManifest`, `discoverIslands`          | Two islands share the same `id`. `details.id` is the duplicated id.                                           |
| `MANIFEST_INVALID_PUBLIC_PATH`  | `islandFileToPublicPath`, `validateManifest`   | An island public path is not canonical (dot-segments, NUL bytes, empty segment, wrong prefix).                |
| `MANIFEST_RESERVED_PATH_COLLISION` | `validateManifest`                          | (defense in depth; unreachable in practice). An island `publicPath` is not under the reserved `/@sprout/` namespace. |
| `BUILD_FAILED`                  | `esbuildBundle`, `compileDevAsset`             | The bundler failed. `details.errors` carries the esbuild error list.                                          |
| `BUILD_OUTPUT_MISSING`          | (reserved)                                     | The bundler produced no `.js` output.                                                                         |
| `BUILD_OUTDIR_UNSAFE`           | `buildProduction`                              | The `outDir` is non-empty and contains a foreign file (not a prior `sprout.manifest.json`). `details.entries` lists the offending entries. |
| `FROZEN_MANIFEST_MISSING`       | `loadFrozenIndex`, `readFrozenAsset`           | `<outDir>/sprout.manifest.json` does not exist; run `sprout build` first. `details.outDir` and `details.manifestPath` are the paths. |
| `FROZEN_MANIFEST_UNSUPPORTED`   | `loadFrozenIndex`, `readFrozenAsset`           | The manifest exists but is unreadable, has the wrong version, is missing assets / files, has a duplicate publicPath, or references a missing on-disk file. `details` carries the offending field. |

## `@sprout/jsx`

The JSX package re-uses the runtime error model. All codes are defined in `packages/jsx/shared/types.ts` and thrown by code in `packages/jsx/shared/props.ts`. The `RuntimeError` class lives in `packages/jsx/shared/errors.ts`.

| Code                 | Where                          | What it means                                                                                                                |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_PROPS`      | `serializeJsonProps`, `parseJsonProps` | The props value is not a JSON record, contains functions / symbols / `undefined` / circular structures, etc. `details.reason` is the failure kind (`not_record`, `json_parse`, `undefined`, `symbol`, `bigint`, `date`, `class_instance`, `map`, `set`, `typed_array`, `circular`, `function`). |
| `PROPS_TOO_LARGE`    | `serializeJsonProps`           | The serialized props exceed `maxChars` (default 65,536). `details.length` is the actual length; `details.max` is the configured cap. |
| `INVALID_PLACEHOLDER`| `mountIsland` (browser-side), `registerIslandComponent` (server-side) | The `data-sprout-src` attribute is not a canonical `/@sprout/island/<id>.js` path (NUL byte, missing prefix / extension, dot-segment, or non-canonical shape). `details.reason` is the failure kind. Server-side: `registerIslandComponent` rejects a non-canonical `src`, a missing `id`, or a non-object component. |
| `MOUNT_FAILED`       | `mountIsland`, `mountComponent`, `mountAll` | The island module could not be loaded, has no `mount` function, or `mount` threw. `details` carries `id`, `src`, and a `cause` string. `mountAll` throws `MOUNT_FAILED` only when the runtime is invoked outside a browser (no `document` global). |

## `@sprout/runtime`

The runtime package re-exports `RuntimeError` from `@sprout/jsx/shared`. All codes thrown by the runtime are the same as the JSX table above.

## `@sprout/core`

| Code                       | Where                          | What it means                                                                                                                |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `ROUTE_NOT_FOUND`          | `renderRoute`                  | No route pattern matches the request URL. Response is 404.                                                                   |
| `ROUTE_METHOD_NOT_ALLOWED` | `renderRoute`                  | The route exists but has no handler for the request method. Response is 405 with an `Allow` header listing the supported methods. |
| `ROUTE_IMPORT_FAILED`      | `renderRoute`                  | The route module failed to import. `details.cause` is the error message. Response is 500.                                   |
| `ROUTE_INVALID_EXPORT`     | `renderRoute`                  | The route module is not an object (the dynamic import resolved to a non-object). `details.moduleType` is the type that was imported. Response is 500. |
| `ROUTE_RENDER_FAILED`      | `renderRoute`                  | The page default export threw during rendering, a method handler threw, or an island module is missing a default export. `details` carries `pathname`, `cause`, and (for island failures) `id` and `file`. Response is 500. |
| `STATIC_FILE_NOT_FOUND`    | `resolvePublicFile`, `serveStaticFile`, `serveFrozenAsset`, etc. | The requested asset does not exist on disk or the URL is under the reserved `/@sprout/` namespace. Response is 404. |
| `STATIC_FILE_OUTSIDE_ROOT` | `serveStaticFile`              | (defense in depth; `resolvePublicFile` already rejects sibling-prefix escapes). The file path is outside the public root. The wire response is a generic 404 — the requested path stays in `details` for server-side logs and is not leaked to the client. |

## `@sprout/cli`

| Code                          | Where           | What it means                                                                                                                |
| ----------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `CLI_UNKNOWN_COMMAND`         | `run`           | The first positional argument is not one of `help`, `init`, `dev`, `build`, `serve`, `inspect`. `details.command` is the unknown name; `details.known` is the closed set. |
| `CLI_INVALID_ARGS`            | `parseArgs`, `run`, `runInit` | A flag is malformed (bare `--flag` at end, `-x` short flag, empty flag name, missing value, etc.). `details.arg` is the offending input. |
| `CLI_INIT_TARGET_NOT_EMPTY`   | `runInit`       | The `init` target directory is non-empty and `--force` was not passed. `details.target` and `details.contents` are the target path and the offending entries. |
| `CLI_INIT_FAILED`             | `runInit`       | An individual init template file already exists and `--force` was not passed, or a `Deno.mkdir` / `Deno.writeTextFile` call failed. `details.file` and `details.cause` are populated. |
| `CLI_INSPECT_FAILED`          | (reserved)      | The `inspect` command failed to load the config or walk the project. (Currently unused: `inspect` errors propagate as `ConfigError` / `CompilerError`.) |
| `CLI_DEV_FAILED`              | (reserved)      | The dev server failed to boot. (Currently unused: dev errors propagate as the underlying typed error.)                       |
| `CLI_BUILD_NOT_IMPLEMENTED`   | (removed in M6) | (Was the M5 placeholder; the M6 `runBuild` calls the real production build.)                                                |
| `CLI_SERVE_FAILED`            | (reserved)      | The production serve failed to load the frozen manifest. (Currently unused: serve errors propagate as `CompilerError` / `CoreError`.) |
| `CLI_USER_ERROR`              | (reserved)      | Catch-all for errors that are not `FrameworkError`s. (Currently unused: any non-`FrameworkError` thrown by a command is wrapped by `run` as `{ ok: false, code: 1, error }` without changing the typed code.) |

## How the table is verified

The M8 hardening pass audited every throw site in the workspace and
asserted each one matches a code in the table. The exit-criterion proof
is the test surface:

- `packages/utils/path_security_test.ts` — `isInsideRoot` and `slash` reject NUL bytes, backslashes, relative paths, empty roots.
- `packages/config/config_malformed_test.ts` — the full config malformed matrix (port, hostname, cache policy, include/exclude, publicDir, styles.app, default export shape, unknown keys).
- `packages/compiler/path_security_test.ts` — `routeFileToPattern`, `islandFileToPublicPath`, and `loadFrozenIndex` reject NUL bytes and `..`.
- `packages/core/path_security_test.ts` — `resolvePublicFile`, `serveStaticFile`, and `etagMatches` typed errors.
- `packages/core/public_url_collision_test.ts` — a public file at `public/@sprout/runtime.js` does NOT shadow the framework route.
- `packages/core/render_malformed_test.ts` — the route module failure modes (throws on import, no default, non-function default, non-function GET, primitive return).
- `packages/jsx/shared/props_size_test.ts` — `PROPS_TOO_LARGE` boundary cases (default cap, custom cap, 0, -1, exactly-at, cap+1).
