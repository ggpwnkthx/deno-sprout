# @sprout/cli

Command-line UX: `init`, `dev`, `build`, `serve`, `inspect`, and `help`. Thin orchestrator over
`@sprout/core`, `@sprout/config`, and `@sprout/compiler`.

`@sprout/cli` is the framework's command-line surface. It is intentionally thin: command
implementations delegate to `@sprout/core`, `@sprout/config`, and `@sprout/compiler`. The public
surface is a pure `run()` function that returns a `CliResult` and never calls `Deno.exit()`. The
binary entrypoint (the `jsr:@sprout/cli` package) is the only layer that may call `Deno.exit()` at
the boundary.

## Public surface

- `run(argv, options?)` — run a CLI invocation end-to-end. Parses `argv`, dispatches to the matching
  command, catches typed `CliError` and `FrameworkError` failures, formats them with `formatError`,
  and returns a `CliResult`. The function never throws, never calls `Deno.exit()`, and never writes
  to stdout/stderr when `silent: true`. The `{ silent, debug }` options control stdout/stderr and
  stack-trace printing; the CLI also accepts `--debug` as a positional flag.
- `printHelp({ out? })` — write the multi-line usage text to `out` (default `console.log`).
- `formatError(err, { debug? })` — turn a thrown value into a human-readable multi-line string.
  `FrameworkError`s get `error: <code>: <message>` plus a `details: { ... }` block when `details`
  has at least one key; other `Error`s get `error: <name>: <message>` plus an optional stack trace
  when `debug: true`. Pure: never throws, never writes to stdout/stderr.
- `parseArgs(argv)` — the hand-rolled argument parser. Exposed for tests and for advanced callers
  that want to drive the dispatch layer directly.
- `CliError` — typed error class. `code` is one of `CliErrorCode`; `details` is a frozen,
  JSON-serializable object.
- `CliErrorCode` — the closed union of stable error codes: `CLI_UNKNOWN_COMMAND`,
  `CLI_INVALID_ARGS`, `CLI_INIT_TARGET_NOT_EMPTY`, `CLI_INIT_FAILED`, `CLI_USER_ERROR`.
- `FormatErrorOptions` — the options shape accepted by `formatError` (`debug`).
- `CliOptions` — the options shape accepted by `run` (`silent`, `debug`).
- `CliResult` — the outcome of a `run` invocation. `ok: true, code: 0` on success;
  `ok: false, code: 1, error` on failure.
- `ParsedArgs` — the structured view of the raw `argv` array. The first non-flag argument is the
  `command`; subsequent non-flag arguments are `positional`; `--flag` arguments populate `flags`
  with `boolean` or `string` values.

## Commands

- `sprout init [dir] [--force]` — scaffold a new project from inline templates. Refuses to overwrite
  a non-empty directory unless `--force` is passed; `--force` only deletes files it created
  (anything outside the init template is refused).
- `sprout dev [root] [--hostname h] [--port p] [--config file]` — start the development server in
  `root` (default `Deno.cwd()`).
- `sprout build [root] [--config file]` — run `loadConfig` then `buildProduction` from
  `@sprout/compiler` against `root` (default `Deno.cwd()`). Writes `<root>/.sprout/dist` with
  content-hashed assets under `_sprout/`, an `sprout.manifest.json`, and optional `.gz` companions
  driven by `config.build.compress`. Prints the human-readable summary from `formatBuildSummary`.
  Refuses to empty an unsafe outDir with `BUILD_OUTDIR_UNSAFE`.
- `sprout serve [root] [--hostname h] [--port p] [--config file]` — start the production server.
  Loads `<outDir>/sprout.manifest.json`, builds the O(1) public-path index, and serves
  content-hashed assets with `ETag` / `gzip` / `cache-control: immutable`. A missing manifest
  produces a typed `FROZEN_MANIFEST_MISSING` error pointing the user at `sprout build`.
- `sprout inspect [root] [--config file]` — print the resolved config and the discovered manifest
  without starting a server.
- `sprout help` — print the usage text.

## Permissions

| Command   | Required flags                                                   |
| --------- | ---------------------------------------------------------------- |
| `init`    | `--allow-read --allow-write`                                     |
| `dev`     | `--allow-read --allow-write --allow-env --allow-net --allow-run` |
| `build`   | `--allow-read --allow-write --allow-env --allow-net --allow-run` |
| `serve`   | `--allow-read --allow-env --allow-net`                           |
| `inspect` | `--allow-read --allow-env`                                       |
| `help`    | (none)                                                           |

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Getting started](https://jsr.io/@sprout/core) — the user-facing getting-started guide, linked
  from `@sprout/core`'s JSR page.
- [Permissions](https://jsr.io/@sprout/core) — the per-command permission table lives in the
  framework docs.

## License

MIT
