# Sprout Build Plan

## 5.2 `@sprout/cli`

### Purpose

`@sprout/cli` owns command-line UX, project scaffolding, and command orchestration. It should be thin: command implementations call into `@sprout/core`, `@sprout/config`, and `@sprout/compiler`.

### Public Command Surface

```text
sprout init [dir]
sprout dev [root]
sprout build [root]
sprout serve [root]
sprout inspect [root]
sprout help
```

`inspect` prints resolved config, discovered routes, discovered islands, and planned asset URLs without starting a server or writing production output.

### Public Exports

```ts
export { run } from "./cli.ts";
export type { CliResult } from "./types.ts";
```

### CLI Result Type

```ts
export type CliResult =
  | { readonly ok: true; readonly code: 0 }
  | {
      readonly ok: false;
      readonly code: 1;
      readonly error: Error;
    };
```

`run()` should return a result or exit code instead of calling `Deno.exit()` internally. The CLI entrypoint may call `Deno.exit()` at the boundary.

### Responsibilities

- Parse minimal positional arguments and flags.
- Print helpful usage text.
- Scaffold a project.
- Delegate dev/build/serve to package APIs.
- Catch typed framework errors and format them for humans.
- Avoid swallowing stack traces when `--debug` is passed.

### Init Template Requirements

Generated files:

```text
deno.jsonc
sprout.config.ts
src/routes/index.tsx
src/islands/Counter.tsx
src/styles/app.css
public/.gitkeep
```

Generated `deno.jsonc`:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net jsr:@sprout/cli dev",
    "build": "deno run --allow-read --allow-write --allow-env jsr:@sprout/cli build",
    "serve": "deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve"
  },
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@sprout/jsx"
  },
  "imports": {
    "@sprout/core": "jsr:@sprout/core@<version>"
  }
}
```

Exact versions are pinned during release automation.

### Dependencies

- `@sprout/core`
- `@sprout/config`
- `@sprout/compiler`
- `@sprout/utils`
- `jsr:@std/fs`
- `jsr:@std/path`

Avoid a heavy CLI parser until there is a real need.

### Permissions

`init`:

```text
--allow-read
--allow-write
```

`dev`:

```text
--allow-read
--allow-write
--allow-env
--allow-net
```

`build`:

```text
--allow-read
--allow-write
--allow-env
```

`serve`:

```text
--allow-read
--allow-env
--allow-net
```

### Required Tests

- Unknown command returns non-zero result.
- `help` returns zero.
- `init` refuses to overwrite non-empty directories unless `--force`.
- `init --force` only deletes files it created or clearly prompts/refuses.
- `dev`, `build`, and `serve` pass the right mode to lower packages.
- Human-readable errors include the framework error code.

### Done Criteria

- A new user can run `init`, `dev`, `build`, and `serve` without manually editing generated files.
- The CLI is a thin orchestrator, not a second implementation of config/discovery/build logic.

---
