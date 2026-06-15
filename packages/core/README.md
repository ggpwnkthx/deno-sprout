# @sprout/core

Primary public server package: Hono-backed `createApp` / `serve`, route method dispatch, HTML shell,
public-file and framework-asset serving for both dev and production.

`@sprout/core` is the primary public server package. It is the only package most application code
imports. It creates the HTTP app, renders route modules, registers island metadata with the server
JSX runtime, serves public files, and serves framework assets for both dev (on-demand compile,
`cache-control: no-store`) and production (frozen manifest, `ETag` / `gzip` /
`cache-control: immutable`).

## Public surface

- `createApp(options?)` — build a Hono-backed HTTP app for a Sprout project. Resolves the config,
  runs discovery, registers the framework asset routes and the per-route handlers, and returns a
  typed `App`.
- `serve(options?)` — resolve the config, build the app, and bind a `Deno.serve` listener in one
  call. The function resolves when the server exits.
- `defineConfig` — re-export of `defineConfig` from `@sprout/config`. Lets app authors wrap their
  `sprout.config.ts` default export through the server package's import map.
- `ConfigInput`, `Mode`, `ResolvedConfig` — re-exports of the `@sprout/config` types most often
  reached for in server code.
- `App` — the framework HTTP app. `hono` exposes the underlying Hono instance; `fetch` is the
  canonical request entry point; `getAssetCacheStats` is the M7 test seam that returns the
  resident-memory footprint of the optional bounded LRU.
- `CreateAppOptions` — the options shape accepted by `createApp` (`root`, `mode`, `configFile`).
- `ServeOptions` — the options shape accepted by `serve` (extends `CreateAppOptions` with
  `hostname`, `port`, `signal`).
- `PageProps` — the props received by a page component (the default export of a route module).
  Carries `params`, the inbound `request`, the parsed `url`, and the framework `RequestContext`.
- `RouteHandler` — the function shape of a method handler on a route module. Receives the framework
  request context and may return any `Response`.
- `RoutePageComponent` — the function shape of a page component.
- `RouteModule` — the default-export shape of a route module: a page (default) plus optional method
  handlers (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`).
- `RequestContext` — the framework request context exposed inside route handlers. Carries the
  inbound request, the parsed URL, the dynamic-segment params, a `locals` map for
  middleware-supplied data, and the response helpers (`html`, `json`, `text`, `redirect`, `render`).
- `CoreError` — typed error class. `code` is one of `CoreErrorCode`; `details` is a frozen,
  JSON-serializable object.
- `CoreErrorCode` — the closed union of stable error codes: `ROUTE_NOT_FOUND`,
  `ROUTE_METHOD_NOT_ALLOWED`, `ROUTE_IMPORT_FAILED`, `ROUTE_INVALID_EXPORT`, `ROUTE_RENDER_FAILED`,
  `STATIC_FILE_NOT_FOUND`, `STATIC_FILE_OUTSIDE_ROOT`.

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Getting started](https://jsr.io/@sprout/core) — the user-facing getting-started guide, linked
  from `@sprout/core`'s JSR page.
- [Build and serve](https://jsr.io/@sprout/core) — the build / serve reference (frozen manifest,
  ETag, gzip, immutable cache).

## License

MIT
