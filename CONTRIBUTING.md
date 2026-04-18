# Contributing to Sprout

## Project structure

Sprout is a Deno workspace monorepo. Source lives under `packages/`.

| Package             | JSR name                    |
| ------------------- | --------------------------- |
| `packages/core/`    | `@ggpwnkthx/sprout-core`    |
| `packages/jsx/`     | `@ggpwnkthx/sprout-jsx`     |
| `packages/islands/` | `@ggpwnkthx/sprout-islands` |
| `packages/router/`  | `@ggpwnkthx/sprout-router`  |
| `packages/static/`  | `@ggpwnkthx/sprout-static`  |
| `packages/dev/`     | `@ggpwnkthx/sprout-dev`     |
| `packages/build/`   | `@ggpwnkthx/sprout-build`   |
| `packages/init/`    | `@ggpwnkthx/sprout-init`    |
| `packages/sprout/`  | `@ggpwnkthx/sprout`         |

## Developer commands

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `deno task dev`   | Start dev server in the current directory |
| `deno task build` | Build for production                      |
| `deno task init`  | Scaffold a new project                    |
| `deno task lint`  | Lint all packages                         |
| `deno task fmt`   | Format all packages                       |
| `deno task check` | Type-check all packages                   |
| `deno task test`  | Run all tests                             |
| `deno task ci`    | Full CI pipeline (lint → check → test)    |

## Running a single test file

    deno test -A packages/router/lib/file_test.ts

## Adding a new package

1. Create `packages/<name>/deno.json` with `name`, `version`, `exports`
2. Add `"packages/<name>"` to the workspace array in `deno.jsonc`
3. Add the JSR package to `versions.json`

## Local testing before first JSR release

Template-scaffolded projects import `jsr:@ggpwnkthx/sprout@^0.1.0`, which does
not exist until the first release. To test the scaffolder locally:

    SPROUT_LOCAL=1 deno task init

This substitutes the JSR specifier with a relative path to the local workspace.
Never commit or publish with `SPROUT_LOCAL=1` set.
