# Sprout Build Plan

## 0. Executive Summary

The new project should optimize for one authoring model:

```tsx
// src/routes/index.tsx
import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Hello</h1>
      <Counter initial={1} />
    </main>
  );
}
```

```tsx
// src/islands/Counter.tsx
export default function Counter(props: { readonly initial: number }) {
  return <button type="button">Count: {props.initial}</button>;
}
```

Application authors should not manually register islands, write island mount wrappers, maintain a `main.ts` manifest, or know which JSX runtime applies to which build target.

The framework owns:

- route discovery;
- island discovery;
- internal manifest generation;
- server JSX placeholder emission;
- browser island mounting;
- generated client island entry modules;
- dev-time on-demand compilation;
- production asset freezing.

The first version should use **client mounting**, not true DOM hydration. Public docs should avoid the word “hydration” unless and until the runtime reconciles existing SSR island DOM.

## 1. Design Goals

1. **Simple server/client DX**
   - Route files are server modules.
   - Island files are browser-capable component modules.
   - JSX works without per-file pragmas.
   - A default-exported island component is enough.

2. **Convention-first, config-second**
   - `src/routes/**` defines route modules.
   - `src/islands/**` defines island modules.
   - `src/styles/app.css` is discovered as the global stylesheet.
   - Explicit config exists for advanced projects but is not required for normal projects.

3. **Compiler-owned internals**
   - Users author components and handlers.
   - The compiler generates manifests, virtual island entries, asset URLs, and build metadata.

4. **Deno-first implementation**
   - Target Deno v2.8+.
   - No Node.js APIs.
   - JSR-only dependency policy.
   - Strict TypeScript everywhere.
   - Deno permission requirements must be documented per command.

5. **Memory-safe defaults**
   - Do not eagerly read large build outputs, public directories, or frozen assets unless needed.
   - Stream static files where possible.
   - Cache metadata separately from file bytes.
   - Keep production asset byte caching opt-in and bounded.

6. **Stable typed errors**
   - Config, discovery, manifest, build, runtime, and HTTP errors should expose stable `code`, `message`, and `details`.
   - Avoid free-form thrown strings from public package boundaries.

## 2. Non-goals for the Initial Release

The first release must deliberately avoid recreating every advanced behavior from the current codebase.

Out of scope for the initial release:

- true DOM hydration;
- partial route prerendering;
- nested layouts;
- streaming SSR;
- route middleware conventions;
- plugin API;
- adapter API for non-Deno runtimes;
- React compatibility;
- server actions;
- user-authored island manifest registration;
- user-authored island mount wrappers;
- custom JSX runtime selection by users;
- arbitrary module-loader thunk extraction.

These may become later milestones, but they should not block a clean MVP.

## 3. Target User-Facing Contract

### 3.1 Project Layout

```text
my-app/
  deno.jsonc
  sprout.config.ts          # optional
  public/
    favicon.ico
  src/
    routes/
      index.tsx             # /
      about.tsx             # /about
      blog/
        [slug].tsx          # /blog/:slug
      api/
        health.ts           # /api/health
    islands/
      Counter.tsx           # /@sprout/island/Counter.js
      cart/
        AddButton.tsx       # /@sprout/island/cart/AddButton.js
    styles/
      app.css               # /@sprout/app.css
```

### 3.2 Minimal Config

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
});
```

`sprout.config.ts` is optional. If missing, the CLI and server assume the project root is the current working directory.

### 3.3 Advanced Config

```ts
import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
  srcDir: "src",
  publicDir: "public",
  outDir: ".sprout/dist",

  routes: {
    dir: "src/routes",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
  },

  islands: {
    dir: "src/islands",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
  },

  styles: {
    app: "src/styles/app.css",
  },

  build: {
    compress: "gzip",
    sourcemap: true,
  },
});
```

### 3.4 Route Module Contract

A route module may export:

```ts
import type { PageProps } from "@sprout/core";

export default function Page(props: PageProps) {
  return <main>{props.params.slug}</main>;
}

export async function GET(c: RequestContext): Promise<Response> {
  return c.render(<Page params={c.params} request={c.request} context={c} />);
}

export async function POST(c: RequestContext): Promise<Response> {
  return c.json({ ok: true });
}
```

Supported method exports:

```text
GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
```

Route default export behavior:

- If a matching method export exists, it wins.
- `GET` falls back to the default page export.
- `HEAD` falls back to `GET` or the default page export and strips the body.
- Non-GET methods without a method export return `405 Method Not Allowed`.
- A route module with neither a default export nor a matching method export is a discovery error.

### 3.5 Island Module Contract

An island module should default-export a component:

```tsx
export type CounterProps = {
  readonly initial: number;
};

export default function Counter(props: CounterProps) {
  return <button type="button">Count: {props.initial}</button>;
}
```

Rules:

- The default export must be callable.
- Props must be JSON-serializable when rendered from a server route.
- Island components may import browser-only APIs, but only inside code that runs in the browser.
- Island modules are compiled with the DOM JSX runtime.
- Server route modules may import island components directly and render them as JSX.
- The compiler generates the client mount module. Users do not write `createIsland(Component)`.

### 3.6 Placeholder Contract

Server rendering an island emits a host element:

```html
<div
  data-sprout-island="Counter"
  data-sprout-src="/@sprout/island/Counter.js"
  data-sprout-props="{&quot;initial&quot;:1}"
></div>
```

Required attributes:

| Attribute | Purpose |
| --- | --- |
| `data-sprout-island` | Stable island id for diagnostics. |
| `data-sprout-src` | Public browser module URL. |
| `data-sprout-props` | JSON-serialized props object. |

Runtime-added attributes:

| Attribute | Purpose |
| --- | --- |
| `data-sprout-mounted="true"` | Marks successful mount; repeated `mountAll()` calls skip it. |
| `data-sprout-error="<CODE>"` | Marks failed mount with a stable runtime error code. |

### 3.7 Public CLI

```sh
deno run -A jsr:@sprout/cli init my-app
deno task dev
deno task build
deno task serve
```

Generated project tasks:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net jsr:@sprout/cli dev",
    "build": "deno run --allow-read --allow-write --allow-env jsr:@sprout/cli build",
    "serve": "deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve"
  }
}
```

## 4. Workspace Structure

```text
packages/
  core/
    mod.ts
    server/
      app.ts
      context.ts
      render_route.tsx
      html_shell.tsx
      static_files.ts
      errors.ts
    runtime.entry.ts
    README.md
    deno.jsonc

  cli/
    cli.ts
    commands/
      init.ts
      dev.ts
      build.ts
      serve.ts
    templates/
      deno.jsonc.txt
      sprout.config.ts.txt
      routes/index.tsx.txt
      islands/Counter.tsx.txt
      styles/app.css.txt
    README.md
    deno.jsonc

  config/
    mod.ts
    define_config.ts
    load_config.ts
    schema.ts
    types.ts
    errors.ts
    README.md
    deno.jsonc

  compiler/
    mod.ts
    discover/
      routes.ts
      islands.ts
      styles.ts
      filesystem.ts
    manifest/
      types.ts
      validate.ts
      paths.ts
    build/
      esbuild.ts
      virtual_modules.ts
      frozen_assets.ts
      dev_assets.ts
      gzip.ts
    errors.ts
    README.md
    deno.jsonc

  jsx/
    jsx-runtime.ts
    jsx-dev-runtime.ts
    server/
      jsx-runtime.ts
      jsx-dev-runtime.ts
      island_registry.ts
      island_placeholder.ts
    dom/
      jsx-runtime.ts
      jsx-dev-runtime.ts
    shared/
      props.ts
      errors.ts
      types.ts
    README.md
    deno.jsonc

  runtime/
    mod.ts
    mount_all.ts
    mount_island.ts
    module_contract.ts
    errors.ts
    README.md
    deno.jsonc

  utils/
    mod.ts
    path.ts
    hash.ts
    http.ts
    streams.ts
    errors.ts
    README.md
    deno.jsonc

examples/
  basic/
  blog/
  islands/
  forms/

tests/
  fixtures/
    basic-app/
    nested-routes/
    broken-config/
    invalid-islands/
```

## 5. Package Specifications

## 5.1 `@sprout/core`

### Purpose

`@sprout/core` is the primary public server package. It creates the HTTP app, renders route modules, registers island metadata with the server JSX runtime, serves development assets, and serves production frozen assets.

It should be the only package most application code imports.

### Public Exports

```ts
export { defineConfig } from "@sprout/config";
export { createApp, serve } from "./server/app.ts";
export type {
  App,
  CreateAppOptions,
  PageProps,
  RequestContext,
  RouteHandler,
  RouteModule,
  ServeOptions,
} from "./server/types.ts";
```

Optional subpath for generated internals only:

```ts
// @sprout/core/runtime-entry
export { start } from "./runtime.entry.ts";
```

Users should not need to import from `@sprout/core/runtime-entry`.

### Server API

```ts
export type CreateAppOptions = {
  readonly root?: string;
  readonly mode?: "development" | "production";
  readonly configFile?: string;
};

export async function createApp(options?: CreateAppOptions): Promise<App>;

export type ServeOptions = CreateAppOptions & {
  readonly hostname?: string;
  readonly port?: number;
  readonly signal?: AbortSignal;
};

export async function serve(options?: ServeOptions): Promise<void>;
```

`App` should initially wrap Hono, but public types should not force users to depend on Hono internals unless deliberately exposed.

### Request Context

```ts
export type RequestContext = {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly locals: Map<string, unknown>;

  html(value: unknown, init?: ResponseInit): Response | Promise<Response>;
  json(value: unknown, init?: ResponseInit): Response;
  text(value: string, init?: ResponseInit): Response;
  redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Response;
  render(value: unknown, init?: ResponseInit): Response | Promise<Response>;
};
```

This keeps Hono replaceable internally while preserving Hono-like ergonomics.

### Responsibilities

- Load resolved config through `@sprout/config`.
- Ask `@sprout/compiler` for the discovered manifest.
- Register island component references before rendering.
- Create the HTML shell.
- Render route modules.
- Serve `public/`.
- In development:
  - serve runtime asset from on-demand compiler output;
  - serve generated island modules;
  - serve app CSS and route CSS;
  - disable browser caching for framework assets.
- In production:
  - load frozen manifest metadata once;
  - serve content-hashed assets from disk;
  - support `ETag`;
  - support gzip when available and accepted;
  - stream or lazily read asset bytes.

### Internal Modules

| Module | Responsibility |
| --- | --- |
| `server/app.ts` | Top-level app creation and middleware registration. |
| `server/context.ts` | Framework request context wrapper. |
| `server/render_route.tsx` | Route import, method dispatch, page fallback, `HEAD` body stripping. |
| `server/html_shell.tsx` | HTML document wrapper, runtime script tag, stylesheet tags. |
| `server/static_files.ts` | Public directory and frozen asset serving. |
| `server/errors.ts` | Core error codes and conversion to HTTP responses. |
| `runtime.entry.ts` | Small browser bootstrap script that imports `@sprout/runtime` and calls `mountAll()`. |

### Dependencies

- `@sprout/config`
- `@sprout/compiler`
- `@sprout/jsx`
- `@sprout/runtime`
- `@sprout/utils`
- `jsr:@hono/hono` for the initial HTTP router/server implementation
- `jsr:@std/media-types` for content type lookup if not kept in utils

### Permissions

Development server:

```text
--allow-read     read project files, public files, config, generated outputs
--allow-write    write dev cache and build outputs if enabled
--allow-env      read PUBLIC_* env vars and config-related env
--allow-net      listen on host/port
```

Production server:

```text
--allow-read     read frozen assets and public files
--allow-env      read host/port/env config
--allow-net      listen on host/port
```

### Required Tests

- Route default export renders.
- Method export wins over page default.
- `HEAD` fallback strips body.
- Missing route export returns typed error.
- Public files fall through to route handlers on miss.
- Dev asset routes set `cache-control: no-store`.
- Production frozen assets set long-lived cache headers.
- Production `ETag` returns `304`.
- Gzip is served only when accepted.
- Island registry is populated before route rendering.

### Done Criteria

- A basic app renders server routes and mounts one island in the browser.
- No app author code imports a browser runtime or `createIsland`.
- Server route modules can import island default exports directly.
- All public errors use stable codes.

---

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

## 5.3 `@sprout/config`

### Purpose

`@sprout/config` defines and validates the configuration contract. It should produce a fully resolved config with absolute, slash-normalized paths and validated options.

### Public Exports

```ts
export { defineConfig } from "./define_config.ts";
export { loadConfig, resolveConfig } from "./load_config.ts";
export type {
  BuildConfig,
  ConfigInput,
  DiscoveredConfig,
  IslandDiscoveryConfig,
  Mode,
  ResolvedConfig,
  RouteDiscoveryConfig,
  StyleConfig,
} from "./types.ts";
```

### Config Types

```ts
export type Mode = "development" | "production";

export type ConfigInput = {
  readonly root?: string;
  readonly srcDir?: string;
  readonly publicDir?: string | false;
  readonly outDir?: string;

  readonly routes?: RouteDiscoveryConfig;
  readonly islands?: IslandDiscoveryConfig;
  readonly styles?: StyleConfig;
  readonly build?: BuildConfig;

  readonly server?: {
    readonly hostname?: string;
    readonly port?: number;
  };
};

export type RouteDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

export type IslandDiscoveryConfig = {
  readonly dir?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
};

export type StyleConfig = {
  readonly app?: string | false;
};

export type BuildConfig = {
  readonly compress?: false | "gzip";
  readonly sourcemap?: boolean;
  readonly minify?: boolean;
  readonly frozenAssetCache?:
    | "none"
    | { readonly kind: "bounded"; readonly maxBytes?: number };
};

export type ResolvedConfig = {
  readonly root: string;
  readonly srcDir: string;
  readonly publicDir: string | null;
  readonly outDir: string;
  readonly routes: Required<RouteDiscoveryConfig>;
  readonly islands: Required<IslandDiscoveryConfig>;
  readonly styles: { readonly app: string | null };
  readonly build: {
    readonly compress: false | "gzip";
    readonly sourcemap: boolean;
    readonly minify: boolean;
    readonly frozenAssetCache:
      | "none"
      | { readonly kind: "bounded"; readonly maxBytes: number };
  };
  readonly server: {
    readonly hostname: string;
    readonly port: number;
  };
};
```

### Defaults

```ts
const defaults = {
  srcDir: "src",
  publicDir: "public",
  outDir: ".sprout/dist",
  routes: {
    dir: "src/routes",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
  },
  islands: {
    dir: "src/islands",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
  },
  styles: {
    app: "src/styles/app.css if it exists, otherwise null",
  },
  build: {
    compress: "gzip",
    sourcemap: "true in development, false in production",
    minify: "false in development, true in production",
    frozenAssetCache: "none",
  },
  server: {
    hostname: "localhost",
    port: 8000,
  },
};
```

### Validation Rules

- `root`, `srcDir`, `publicDir`, `outDir`, route dir, island dir, and style paths must resolve inside `root` unless a future explicit external-path escape hatch is added.
- `port` must be an integer between `1` and `65535`.
- `hostname` must be a non-empty string.
- `compress` must be `false` or `"gzip"`.
- `frozenAssetCache.maxBytes` must be a positive integer.
- `include` and `exclude` patterns must be non-empty strings.
- Unknown top-level keys should be rejected in strict mode and warned in default mode.

### Error Codes

```ts
type ConfigErrorCode =
  | "CONFIG_IMPORT_FAILED"
  | "CONFIG_INVALID_SHAPE"
  | "CONFIG_INVALID_PATH"
  | "CONFIG_PATH_OUTSIDE_ROOT"
  | "CONFIG_INVALID_PORT"
  | "CONFIG_INVALID_CACHE_POLICY";
```

### Dependencies

- `@sprout/utils`
- `jsr:@std/fs`
- `jsr:@std/path`

Avoid schema libraries initially. Hand-written validators keep dependency weight low and error messages precise.

### Permissions

```text
--allow-read     read config file and detect default stylesheet/public directory
--allow-env      optional env overrides if supported
```

### Required Tests

- Missing config file resolves defaults.
- Config default export is loaded.
- Config named export is either supported explicitly or rejected consistently.
- Relative paths resolve against root.
- Absolute paths inside root are accepted.
- Sibling-prefix escapes are rejected.
- Invalid cache policy throws typed error.
- Invalid port throws typed error.

### Done Criteria

- Every package receives a `ResolvedConfig`, never raw config input.
- All path comparisons use slash-normalized absolute paths.
- Config loading does not create files or start servers.

---

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

## 5.5 `@sprout/jsx`

### Purpose

`@sprout/jsx` owns JSX runtime behavior for server and browser builds.

It should provide:

- server JSX runtime that emits placeholders for registered island component references;
- DOM JSX runtime that renders real browser nodes for island bundles;
- shared JSON prop serialization/parsing;
- stable runtime error types.

### Public Exports

Root server runtime:

```ts
// @sprout/jsx
export { Fragment, jsx, jsxs, jsxAttr, jsxEscape, jsxTemplate } from "./server/jsx-runtime.ts";
export type { JSX } from "./server/jsx-runtime.ts";
```

Browser DOM runtime:

```ts
// @sprout/jsx/dom
export { Fragment, jsx, jsxs } from "./dom/jsx-runtime.ts";
export type { JSX } from "./dom/jsx-runtime.ts";
```

Shared helpers:

```ts
// @sprout/jsx/shared
export {
  parseJsonProps,
  serializeJsonProps,
  RuntimeError,
} from "./shared/props.ts";
export type { JsonRecord, JsonValue, RuntimeErrorCode } from "./shared/types.ts";
```

Server island registry:

```ts
// @sprout/jsx/server/island-registry
export {
  clearIslandRegistry,
  registerIslandComponent,
} from "./server/island_registry.ts";
```

The registry subpath is internal-but-exported for `@sprout/core` and tests. It is not promoted in user docs.

### Island Registry Contract

```ts
export function registerIslandComponent(
  component: object,
  metadata: {
    readonly id: string;
    readonly src: `/@sprout/island/${string}.js`;
  },
): void;
```

The server JSX runtime checks the registry when JSX receives a component tag:

```tsx
<Counter initial={1} />
```

If `Counter` is registered as an island, the server runtime emits a placeholder instead of executing/serializing the normal component output.

If it is not registered, JSX falls back to normal server rendering.

### Serialization Rules

Accepted props:

- plain records;
- arrays;
- strings;
- finite numbers;
- booleans;
- `null`;
- nested combinations of the above.

Rejected props:

- functions;
- symbols;
- `undefined`;
- `bigint`;
- `Date`;
- class instances;
- circular structures;
- top-level arrays or `null` for island props.

Default maximum serialized props length:

```ts
export const DEFAULT_MAX_SERIALIZED_PROPS_CHARS = 65_536;
```

### Error Codes

```ts
type RuntimeErrorCode =
  | "INVALID_PROPS"
  | "PROPS_TOO_LARGE"
  | "INVALID_PLACEHOLDER"
  | "MOUNT_FAILED";
```

### Dependencies

- `jsr:@hono/hono` for `hono/jsx` and `hono/jsx/dom`
- optionally `jsr:@std/json` only if it materially improves JSON validation; otherwise use built-ins

### Permissions

None. This package should not call Deno APIs.

### Required Tests

- Unregistered component renders normally.
- Registered island component emits placeholder.
- Placeholder includes `data-sprout-island`, `data-sprout-src`, and serialized props.
- Invalid src is rejected.
- Invalid props throw `INVALID_PROPS`.
- Oversized props throw `PROPS_TOO_LARGE`.
- DOM runtime renders normal JSX in browser-like tests.
- Registry can be cleared between apps/tests.

### Done Criteria

- Server routes can import island components as ordinary values.
- The only SSR island detection mechanism is component identity registration.
- The runtime does not use legacy marker properties on component functions.

---

## 5.6 `@sprout/runtime`

### Purpose

`@sprout/runtime` is the browser-only island mounting package. It scans placeholder elements, imports island client modules, validates props, and mounts components.

Users should not normally import this package. Generated runtime and island wrapper entries import it.

### Public Exports

```ts
export { mountAll } from "./mount_all.ts";
export { mountIsland } from "./mount_island.ts";
export { mountComponent } from "./mount_component.ts";
export type {
  IslandClientModule,
  IslandMountResult,
  MountComponent,
} from "./module_contract.ts";
```

### Module Contract

Compiled island bundles default-export:

```ts
export type IslandClientModule = {
  readonly mount: (
    element: HTMLElement,
    props: Readonly<Record<string, unknown>>,
  ) => void | Promise<void>;
};
```

Generated wrappers use:

```ts
export function mountComponent<Props extends Record<string, unknown>>(
  element: HTMLElement,
  Component: (props: Readonly<Props>) => unknown,
  props: Readonly<Record<string, unknown>>,
): void;
```

Implementation:

- clear the placeholder element;
- render `Component(props)` into the element with the DOM JSX renderer;
- mark successful mount.

### `mountAll`

```ts
export async function mountAll(root?: ParentNode): Promise<readonly IslandMountResult[]>;
```

Behavior:

- default root is `document`;
- scan `[data-sprout-src]`;
- skip nodes with `data-sprout-mounted="true"`;
- mount in document order;
- catch errors per node;
- continue after failures;
- return structured results;
- log failures with a `[sprout]` prefix.

### Result Type

```ts
export type IslandMountResult =
  | {
      readonly ok: true;
      readonly id: string;
      readonly src: string;
      readonly element: HTMLElement;
    }
  | {
      readonly ok: false;
      readonly id: string;
      readonly src: string;
      readonly element: HTMLElement;
      readonly error: RuntimeError;
    };
```

### Security and Validation

- `data-sprout-src` must start with `/@sprout/island/`.
- `data-sprout-src` must end with `.js`.
- `data-sprout-src` must contain no NUL bytes.
- `data-sprout-src` must contain no `.` or `..` path segments.
- props must parse as a JSON record.
- imported module default export must expose a callable `mount`.
- mount errors are wrapped as `MOUNT_FAILED`.

### Dependencies

- `@sprout/jsx/shared`
- `@sprout/jsx/dom`
- no Deno APIs
- no server-only imports

### Permissions

None. Browser-only.

### Required Tests

- `mountAll` mounts all placeholders.
- Already-mounted nodes are skipped.
- Invalid src marks node with error.
- Invalid props marks node with error.
- Failed dynamic import marks node with error.
- Module without `mount` marks node with error.
- One failed mount does not stop later mounts.
- Repeated `mountAll()` is idempotent.

### Done Criteria

- Runtime entry bundle is small and does not include the full DOM JSX renderer unless needed.
- Island DOM renderer lives in island/vendor bundle, not in the bootstrap script when possible.
- Public docs call this “mounting,” not “hydration.”

---

## 5.7 `@sprout/utils`

### Purpose

`@sprout/utils` contains small environment-safe helpers shared across packages. It must not contain framework semantics.

### Public Exports

```ts
export { slash, isInsideRoot, joinUrlPath } from "./path.ts";
export { hashBytes, hashText } from "./hash.ts";
export { acceptsGzip } from "./http.ts";
export { readAllLimited, streamToUint8Array } from "./streams.ts";
export { FrameworkError } from "./errors.ts";
```

### Responsibilities

- slash-normalized path helpers;
- safe root containment checks;
- SHA-256 hashing;
- gzip `Accept-Encoding` parsing;
- small stream helpers with byte limits;
- base typed error class.

### Base Error

```ts
export class FrameworkError<
  Code extends string,
  Details extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  readonly code: Code;
  readonly details: Details;
}
```

### Dependencies

- `jsr:@std/path`
- `jsr:@std/encoding`

### Permissions

None by default. Helpers may operate on passed values only. Any filesystem reads belong in higher packages.

### Required Tests

- `slash` normalizes backslashes and repeated slashes.
- `isInsideRoot` rejects sibling-prefix escapes.
- `hashBytes` is deterministic.
- `acceptsGzip` handles `gzip`, wildcard, q-values, and `gzip;q=0`.
- stream helpers enforce limits.

### Done Criteria

- No package imports a utility by reaching into another package’s internals.
- Utility functions have no hidden process-global state.

---

## 6. Cross-Package Dependency Rules

Allowed graph:

```text
@sprout/cli
  -> @sprout/core
  -> @sprout/config
  -> @sprout/compiler

@sprout/core
  -> @sprout/config
  -> @sprout/compiler
  -> @sprout/jsx
  -> @sprout/utils

@sprout/compiler
  -> @sprout/config
  -> @sprout/runtime
  -> @sprout/jsx
  -> @sprout/utils

@sprout/runtime
  -> @sprout/jsx
  -> @sprout/utils

@sprout/config
  -> @sprout/utils

@sprout/jsx
  -> @sprout/utils? only for shared error base if needed

@sprout/utils
  -> no Sprout packages
```

Forbidden:

- `@sprout/config -> @sprout/compiler`
- `@sprout/config -> @sprout/core`
- `@sprout/jsx -> @sprout/core`
- `@sprout/runtime -> @sprout/core`
- package cycles of any kind

## 7. JSX Build Specification

### Server Compilation

Route files compile with:

```jsonc
{
  "jsx": "automatic",
  "jsxImportSource": "@sprout/jsx"
}
```

Server JSX behavior:

1. If JSX tag is a registered island component reference, emit placeholder.
2. Otherwise delegate to Hono server JSX.

### Island Compilation

Island virtual entries compile with:

```jsonc
{
  "jsx": "automatic",
  "jsxImportSource": "@sprout/jsx/dom"
}
```

Island DOM behavior:

1. Render normal JSX into browser DOM.
2. Support Hono-compatible DOM hooks if provided by the underlying runtime.
3. Never emit island placeholders from browser JSX.

### Dev JSX

Dev mode may use `jsxDEV`, but `jsxDEV` must preserve the same runtime branch behavior as production JSX.

## 8. Manifest and Asset Specification

### In-Memory Manifest

The manifest is internal, generated, and versioned:

```ts
export type Manifest = {
  readonly version: 1;
  readonly routes: readonly RouteEntry[];
  readonly islands: readonly IslandEntry[];
  readonly styles: {
    readonly app: StyleEntry | null;
  };
};
```

### Frozen Manifest

Production builds write:

```text
<outDir>/sprout.manifest.json
```

Shape:

```ts
export type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};
```

### Content-Hashed Asset Files

```text
.sprout/dist/
  sprout.manifest.json
  _sprout/
    runtime.<hash16>.js
    vendor.<hash16>.js
    island-Counter.<hash16>.js
    style-app.<hash16>.css
```

### Browser Public URLs

Manifest entries map stable public paths to hashed files:

```json
{
  "kind": "island",
  "id": "Counter",
  "publicPath": "/@sprout/island/Counter.js",
  "file": "_sprout/island-Counter.0123456789abcdef.js",
  "contentType": "text/javascript; charset=utf-8",
  "hash": "..."
}
```

Public URLs stay stable; file paths are content-hashed.

## 9. CSS Specification

Initial CSS support:

- global app CSS only;
- discovered at `src/styles/app.css`;
- served at `/@sprout/app.css`;
- compiled by the same compiler package;
- linked from every HTML response when present.

Deferred CSS support:

- route-specific CSS;
- island-specific CSS;
- CSS modules;
- CSS extraction from island imports;
- critical CSS.

The MVP should not block on advanced CSS.

## 10. Dev Server Specification

Dev server responsibilities:

- resolve config;
- discover project;
- create app;
- render routes;
- compile runtime/island/CSS assets on demand;
- expose source maps;
- no-store cache headers;
- clear, overlay-free error responses.

Asset routes:

```text
GET /@sprout/runtime.js
GET /@sprout/app.css
GET /@sprout/island/<id>.js
GET /@sprout/island/<id>.js.map
```

Development cache invalidation:

- cache compiled output by entry, kind, mode, public env hash, and input set hash;
- re-stat known input paths before serving cached output;
- coalesce concurrent cold builds for the same key.

## 11. Production Build Specification

`sprout build` must:

1. resolve config;
2. discover project;
3. validate manifest;
4. assert `outDir` is safe to empty;
5. compile runtime;
6. compile vendor bundle if enabled;
7. compile app CSS if present;
8. compile all islands from generated virtual entries;
9. write hashed files;
10. write gzip companions when enabled;
11. write frozen manifest;
12. print a concise summary.

Output summary example:

```text
Built 5 assets into .sprout/dist
  runtime  /@sprout/runtime.js
  style    /@sprout/app.css
  island   /@sprout/island/Counter.js
```

## 12. Production Serve Specification

`sprout serve` must:

- resolve config;
- load frozen manifest once;
- build `Map<publicPath, FrozenAssetMetadata>`;
- not eagerly read asset bytes;
- serve raw or gzip bytes based on `Accept-Encoding`;
- set `ETag`;
- return `304` on matching `If-None-Match`;
- set immutable cache headers for hashed framework assets;
- serve public files;
- render server routes from source or compiled route modules depending on final build decision.

For the initial release, production may still import route source files directly at runtime, as long as required permissions and behavior are documented. A later release can add server route bundling.

## 13. Security and Validation Rules

### Paths

- All discovered files must resolve inside project root.
- Reject NUL bytes in paths.
- Reject path traversal in public asset URLs.
- Never use string-prefix root checks; use relative path containment checks.

### Props

- Island props must be JSON records.
- Reject circular values.
- Enforce max serialized length.
- Reject top-level arrays and `null`.

### Public URLs

- Framework reserves `"/@sprout/"`.
- Public directory files must not shadow framework URLs.
- Island URLs must be canonical and extension-normalized.

### OutDir

Production build may empty `outDir` only when:

- it does not exist;
- it exists and is empty;
- it exists and contains a prior `sprout.manifest.json`.

Otherwise fail with a typed `BUILD_OUTDIR_UNSAFE` error.

## 14. Memory and I/O Rules

- Do not read entire public directories into memory.
- Do not preload frozen asset bytes at production startup.
- Metadata maps are acceptable; byte maps must be opt-in and bounded.
- Use streaming responses for public files where possible.
- Build outputs may be in memory during compilation, but immediately write production assets to disk.
- Large request bodies are out of scope for the core renderer; endpoint handlers own their own body reads.
- Any helper that converts a stream to bytes must accept an explicit max byte limit.

## 15. Test Strategy

### Unit Tests

Each package owns local `Deno.test` tests for validators, mapping functions, and small runtime behavior.

### Integration Tests

Workspace-level fixtures should test full apps:

```text
tests/fixtures/basic-app
tests/fixtures/nested-routes
tests/fixtures/dynamic-routes
tests/fixtures/island-props
tests/fixtures/broken-config
tests/fixtures/duplicate-routes
tests/fixtures/production-build
```

### Browser-ish Runtime Tests

Use DOM-compatible testing only where necessary. Keep most runtime tests against small fake elements or a minimal DOM test environment.

### Golden Tests

Use golden snapshots for:

- discovered manifest;
- frozen manifest;
- generated virtual island entry;
- CLI init output.

Golden snapshots must be stable across platforms by slash-normalizing paths or replacing root prefixes with `<root>`.

## 16. Documentation Deliverables

Required docs before first release:

```text
README.md
docs/getting-started.md
docs/routes.md
docs/islands.md
docs/config.md
docs/build-and-serve.md
docs/deployment.md
docs/errors.md
docs/security.md
docs/internals.md
```

Docs language rules:

- Say “mount” for islands.
- Do not say “hydrate” until true DOM hydration exists.
- Treat the manifest as an internal detail.
- Show default-export islands only.
- Avoid explaining JSX runtimes in the quickstart.

## 17. Milestones

## M0 — Repository Bootstrap

### Goals

Create a strict, Deno-native workspace with package boundaries and CI tasks.

### Deliverables

- workspace `deno.jsonc`;
- package folders;
- root `deno task check`;
- root `deno task test`;
- root `deno task fmt`;
- root `deno task lint`;
- shared TypeScript compiler options;
- import map strategy;
- initial README.

### Exit Criteria

- `deno task check` succeeds with empty package skeletons.
- No package has a dependency cycle.
- All packages declare JSR names and exports.

---

## M1 — JSX and Runtime Contract

### Goals

Prove the island rendering loop independently of routing/build complexity.

### Deliverables

- `@sprout/jsx` server runtime;
- `@sprout/jsx/dom` runtime;
- island registry;
- prop serialization and parsing;
- `@sprout/runtime` `mountAll`;
- generated-wrapper contract test.

### Exit Criteria

- Server JSX emits a placeholder for a registered component.
- Browser runtime mounts a placeholder using a fake island module.
- Invalid props and invalid src produce typed errors.
- Docs clearly say this is mounting, not hydration.

---

## M2 — Config and Discovery

### Goals

Resolve project config and discover routes/islands from files.

### Deliverables

- `defineConfig`;
- `loadConfig`;
- route file mapper;
- island file mapper;
- internal manifest type;
- manifest validator;
- `inspect`-style output function.

### Exit Criteria

- A fixture app with nested/dynamic routes produces the expected manifest.
- Duplicate routes fail.
- Duplicate island public paths fail.
- Paths outside root fail.
- No user-authored app manifest exists.

---

## M3 — Server Rendering MVP

### Goals

Render discovered routes through the server app.

### Deliverables

- `createApp`;
- request context;
- route method dispatch;
- HTML shell;
- runtime script injection;
- app stylesheet link injection;
- public static files.

### Exit Criteria

- A basic app route returns HTML.
- `GET`, `POST`, and `HEAD` behavior is correct.
- Public files are served.
- Island placeholders appear in route HTML.

---

## M4 — Development Asset Pipeline

### Goals

Compile runtime, app CSS, and islands on demand in development.

### Deliverables

- esbuild wrapper;
- runtime asset compile;
- virtual island entry compile;
- CSS compile;
- sourcemap routes;
- single-flight build cache;
- input-set invalidation.

### Exit Criteria

- Browser can load `/@sprout/runtime.js`.
- Browser can load `/@sprout/island/Counter.js`.
- Editing an island invalidates the dev bundle.
- Editing a transitive import invalidates the dev bundle.
- Development assets use `cache-control: no-store`.

---

## M5 — CLI MVP

### Goals

Provide end-to-end user commands.

### Deliverables

- `sprout init`;
- `sprout dev`;
- `sprout build` placeholder or partial production build;
- `sprout serve` placeholder or development-backed serve;
- `sprout inspect`;
- human-readable error formatting.

### Exit Criteria

- `init` creates a runnable app.
- `dev` serves the generated app.
- `inspect` prints routes and islands.
- CLI tests do not call `Deno.exit()` directly.

---

## M6 — Production Build

### Goals

Freeze runtime, island, CSS, and manifest assets.

### Deliverables

- safe outDir emptying;
- hashed asset writing;
- frozen manifest;
- gzip companions;
- content type resolution;
- build summary output.

### Exit Criteria

- `sprout build` writes a complete `.sprout/dist`.
- Frozen manifest maps stable public paths to hashed files.
- Unsafe outDir is refused.
- Gzip files are written when configured.

---

## M7 — Production Serve

### Goals

Serve built assets and app routes in production mode.

### Deliverables

- frozen manifest loader;
- O(1) public path index;
- lazy asset byte reads;
- gzip negotiation;
- ETag handling;
- immutable cache headers;
- optional bounded LRU.

### Exit Criteria

- `sprout serve` serves production assets from the frozen manifest.
- `If-None-Match` returns `304`.
- `gzip;q=0` does not receive gzip.
- Startup does not load all asset bytes.

---

## M8 — Hardening and Security

### Goals

Close common correctness and security gaps before public release.

### Deliverables

- path traversal tests;
- public URL collision tests;
- props size tests;
- malformed config tests;
- malformed route/island module tests;
- permission docs;
- error code docs.

### Exit Criteria

- Every public failure mode has a typed error.
- Every command documents required Deno permissions.
- Security docs cover paths, public URL namespace, props serialization, and outDir safety.

---

## M9 — Documentation and Examples

### Goals

Make the framework understandable without exposing internals.

### Deliverables

- getting started guide;
- routes guide;
- islands guide;
- config guide;
- build/deploy guide;
- examples: basic, blog, forms, nested routes, island composition.

### Exit Criteria

- A new user can build the basic example using only docs.
- Examples avoid manual island registration.
- Examples avoid user-authored mount wrappers.

---

## M10 — Release Candidate

### Goals

Prepare the first publishable JSR release.

### Deliverables

- pinned JSR dependency versions;
- package READMEs;
- changelog;
- smoke tests against generated app;
- publish dry-run;
- API review;
- compatibility matrix for Deno v2.8+.

### Exit Criteria

- All packages pass `deno publish --dry-run`.
- Generated app passes dev and production smoke tests.
- Public API surface is documented.
- No package exposes unnecessary internals.

## 18. Post-MVP Backlog

Consider after the first stable release:

- true DOM hydration;
- route-level CSS;
- island-level CSS extraction;
- server route bundling for production;
- file-system watch mode;
- plugin API;
- nested layouts;
- middleware conventions;
- error overlay;
- deployment adapters;
- partial prerendering;
- streaming responses;
- data loading conventions;
- route groups;
- metadata/head API;
- typed route params generation.

## 19. Release Quality Bar

A release candidate must satisfy:

- strict TypeScript across every package;
- no `any` in public APIs;
- no Node.js APIs;
- JSR-only dependencies;
- no package dependency cycles;
- all untrusted input validated;
- all framework-thrown public errors typed;
- Deno permissions documented;
- production startup does not eagerly load all asset bytes;
- generated app works in dev and production;
- docs show the intended DX first.

## 20. Implementation Notes From the Reference Codebase

The current codebase provides useful lessons but should not dictate the new public API:

- The existing package split proves the value of separating config, build, JSX, manifest, core server, and utilities.
- The existing placeholder-based island runtime is a good MVP model, but should be described as mounting rather than hydration.
- The existing registry-by-component-reference design is the right direction for allowing route JSX to render island components without explicit markers.
- The existing production build’s safe outDir guard, gzip negotiation, frozen manifest, and dev cache invalidation are worth preserving as internal behavior.
- The existing manual `route()` / `island()` app manifest and `createIsland(Component)` user contract should not be carried forward into the new public DX.
