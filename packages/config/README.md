# @sprout/config

Defines and validates the Sprout project configuration. Produces a fully resolved config with
absolute, slash-normalized paths.

`@sprout/config` is the single source of truth for the project configuration. Every other package
consumes a `ResolvedConfig`; users write a `ConfigInput` (typically via `defineConfig({ ... })` in
`sprout.config.ts`) and the loader validates the shape, fills in defaults from the resolved mode,
and returns a fully normalized config with absolute paths.

## Public surface

- `loadConfig(options?)` — load and validate the project configuration. Resolves the project root,
  imports `sprout.config.ts` when present, and either returns a `ResolvedConfig` built from the
  imported defaults or from the built-in defaults. Any thrown error from the import is rethrown as a
  typed `ConfigError`.
- `resolveConfig(input, { root, mode })` — validate a `ConfigInput` and produce a `ResolvedConfig`
  without touching the filesystem (other than to check the optional `styles.app` stylesheet). Useful
  for tests and tooling.
- `defineConfig(input)` — identity helper for `sprout.config.ts` default exports. Wrapping the
  config is optional but improves editor hover types and makes the intent of the file explicit.
- `LoadConfigOptions` — the options shape accepted by `loadConfig` (`root`, `mode`, `configFile`).
- `Mode` — `"development" | "production"`. Drives default `sourcemap`, `minify`, and
  `frozenAssetCache` choices.
- `ConfigInput` — the raw object a user exports from `sprout.config.ts`. All fields are optional;
  the loader fills in defaults and validates shape.
- `ResolvedConfig` — the fully validated, fully normalized form every other package receives. All
  paths are slash-normalized absolute paths; mode-driven defaults are filled in.
- `RouteDiscoveryConfig`, `IslandDiscoveryConfig`, `StyleConfig`, `BuildConfig` — nested shapes for
  the `routes`, `islands`, `styles`, and `build` config sections.
- `ConfigError` — typed error class. `code` is one of `ConfigErrorCode`; `details` is a frozen,
  JSON-serializable object describing the failure (the offending path, the conflicting field, the
  attempted port, ...).
- `ConfigErrorCode` — the closed union of stable error codes: `CONFIG_IMPORT_FAILED`,
  `CONFIG_INVALID_SHAPE`, `CONFIG_INVALID_PATH`, `CONFIG_PATH_OUTSIDE_ROOT`, `CONFIG_INVALID_PORT`,
  `CONFIG_INVALID_CACHE_POLICY`.

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Config docs](https://jsr.io/@sprout/core) — the user-facing config reference (linked from
  `@sprout/core`'s JSR page).
- [Permissions](https://jsr.io/@sprout/core) — the per-command permission table lives in the
  framework docs.

## License

MIT
