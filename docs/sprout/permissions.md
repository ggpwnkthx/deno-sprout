# Deno Permissions

Every Sprout command declares a fixed set of Deno permissions. This
document is the canonical reference; the per-package JSDoc and the CLI's
`--debug` help block mirror it.

The M8 hardening pass audits the existing per-command permission
requirements against the actual code paths the commands exercise. The
result is the table below: every permission listed is required, and
every required permission is listed.

## `init`

| Permission       | Why                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--allow-read`   | Read the project root to check whether the target is empty before scaffolding.                |
| `--allow-write`  | Write the generated `deno.jsonc`, `sprout.config.ts`, and the `src/`, `islands/`, `public/` directories. |

## `dev`

| Permission       | Why                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--allow-read`   | Read source files, `sprout.config.ts`, the `publicDir` files, generated outputs, and Deno's module cache. |
| `--allow-write`  | Write the dev cache and the M4 virtual island entry files (`$TMPDIR/sprout-virtual-entries/`). |
| `--allow-env`    | Read `PUBLIC_*` environment variables (the `envHash` cache-key input; placeholder value is `m4` in M7). |
| `--allow-net`    | Bind the listening socket. The dev pipeline may also fetch `jsr:` / `https:` modules through the Deno esbuild plugin, and a cold native esbuild install may fetch the platform binary. |
| `--allow-run`    | Execute the cached native esbuild binary used by `@ggpwnkthx/esbuild`. |

## `build`

| Permission       | Why                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--allow-read`   | Read source files, `sprout.config.ts`, the `publicDir` files, and Deno's module cache.         |
| `--allow-write`  | Write `<outDir>/_sprout/` (the hashed asset bytes) and `<outDir>/sprout.manifest.json`.        |
| `--allow-env`    | Read `PUBLIC_*` environment variables.                                                        |
| `--allow-net`    | Fetch remote modules through the Deno esbuild plugin and fetch the native esbuild binary on a cold cache. |
| `--allow-run`    | Execute the cached native esbuild binary used by `@ggpwnkthx/esbuild`. |

## `serve`

| Permission       | Why                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--allow-read`   | Read the frozen manifest (`<outDir>/sprout.manifest.json`) and the asset bytes from disk.      |
| `--allow-env`    | Read host/port environment configuration.                                                    |
| `--allow-net`    | Bind the listening socket.                                                                    |

## `inspect`

| Permission       | Why                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--allow-read`   | Read source files, `sprout.config.ts`, and the discovered manifest.                            |

## What M8 does not require

- `--allow-write` to the user's source tree — `sprout build` only writes to `<outDir>`, and `sprout dev` writes only to `$TMPDIR/sprout-virtual-entries/`. Both are documented above.
- `--allow-net` for `jsr:` fetches in production — `sprout serve` reads `<outDir>/sprout.manifest.json` and the bundled assets from disk; no remote module fetching happens at runtime.

## How the table is verified

The M8 hardening pass audited every public code path the commands touch. The audit confirmed:

- `init` calls `Deno.statSync`, `Deno.readDirSync`, `Deno.mkdir`, `Deno.writeTextFile` against the target directory. The permission set is read + write.
- `dev` calls `loadConfig` (read), `createApp` (read), `serve` (read + net for the listener), and the dev pipeline writes to `$TMPDIR` (write), reads `PUBLIC_*` env vars (env), resolves/fetches modules (net), and executes the native esbuild binary (run).
- `build` calls `loadConfig` (read), `buildProduction` (read + write to `<outDir>`), the env-hash step (env), remote module/binary fetch paths (net), and the native esbuild binary (run).
- `serve` calls `loadConfig` (read), `createApp` (read), `serve` (read + net for the listener), and the env config path (env).
- `inspect` calls `loadConfig` (read) and `discoverProject` (read).

Any new permission introduced after M8 must be added to the table and to the per-command JSDoc.

