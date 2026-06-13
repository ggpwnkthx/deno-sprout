# Sprout Build Plan

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
