# Sprout Documentation

This is the user-facing documentation for Sprout. The developer-facing design
contract and the per-package design notes live under [`docs/sprout/`](sprout/).
The build plan and milestone breakdown live there too.

## Getting started

- [Getting started](getting-started.md) — from `sprout init` to a running app in
  five minutes.

## Topical guides

- [Routes](routes.md) — file conventions, method exports, dynamic + catch-all
  patterns, route groups, and the default page.
- [Islands](islands.md) — the island contract: default export only, JSON-serializable
  props, the mount loop, what is NOT needed.
- [Config](config.md) — every `ResolvedConfig` field, defaults, validation, and
  path resolution.
- [Build and serve](build-and-serve.md) — `sprout build` output layout,
  `sprout serve` with the frozen manifest, ETag / gzip / immutable cache,
  perf notes.
- [Deployment](deployment.md) — deploying a built app to Deno Deploy, a VPS,
  or a container.

## Reference

- [Security](security.md) — path / URL / props / `outDir` rules, frozen manifest
  validation, and links to the developer reference.
- [Internals](internals.md) — the manifest shape, the asset pipeline, dev vs.
  production, and the virtual island entry. (Read this if you want to know
  what the framework is doing under the hood.)

## Developer reference

- [Permissions](sprout/permissions.md) — per-command Deno permission table
  with rationale.
- [Errors](sprout/errors.md) — per-package error code table with where-thrown
  and what-means.

## Examples

Runnable example apps live under `examples/` in the repository:

- [`examples/basic/`](../examples/basic/) — the canonical "hello, world" with
  a Counter island.
- [`examples/blog/`](../examples/blog/) — a post list, post detail (`/blog/:slug`),
  a JSON API endpoint, and a like-button island.
- [`examples/forms/`](../examples/forms/) — a POST handler, JSON response,
  redirect-after-POST, and an island that polls an API.
- [`examples/nested-routes/`](../examples/nested-routes/) — dynamic, catch-all,
  and route-group routes.
- [`examples/island-composition/`](../examples/island-composition/) — three
  islands on one page; each is independent and the page shows how props flow
  from the route into the islands.
