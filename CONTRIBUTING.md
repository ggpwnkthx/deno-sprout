# Contributing to Sprout

## Project structure

Sprout is a Deno workspace monorepo. Source lives under `packages/`.

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

    deno test -A packages/<name>/tests/<subject>.test.ts

## Adding a new package

1. Create `packages/<name>/deno.jsonc` with `name`, `version`, `exports`
2. Add `"packages/<name>"` to the workspace array in `deno.jsonc`
