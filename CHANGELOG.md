# Changelog

Sprout follows the [Conventional Commits](https://www.conventionalcommits.org/) specification.
Commit messages use the format `type(scope): description` as described in `CONVENTIONAL_COMMITS.md`.
Per-milestone release notes are distilled from `docs/sprout/milestones/`.

All 11 milestones (M0–M10) are shipped. The current release is **v0.2.0**.

---

## M0 — Repository Bootstrap

- Add workspace `deno.jsonc` with shared TypeScript compiler options
- Add package folders for all 7 workspace packages (`@sprout/utils`, `@sprout/config`,
  `@sprout/compiler`, `@sprout/jsx`, `@sprout/runtime`, `@sprout/core`, `@sprout/cli`)
- Add root tasks: `deno task check`, `deno task test`, `deno task fmt`, `deno task lint`
- Establish JSR import map strategy with no dependency cycles
- Add initial `README.md`

---

## M1 — JSX and Runtime Contract

- Add `@sprout/jsx` server runtime that emits island placeholders
- Add `@sprout/jsx/dom` browser runtime that mounts placeholders into the DOM
- Add island registry tracking component name and public path
- Add prop serialization and parsing for island mount data
- Add `@sprout/runtime` `mountAll` loop
- Add generated-wrapper contract test proving the island rendering loop

---

## M2 — Config and Discovery

- Add `defineConfig` and `loadConfig` for project configuration
- Add route file mapper discovering `src/routes/**`
- Add island file mapper discovering `src/islands/**`
- Add internal manifest type and manifest validator
- Add `inspect`-style output function for debugging the manifest
- Reject duplicate routes, duplicate island public paths, and paths outside root

---

## M3 — Server Rendering MVP

- Add `createApp` wrapping Hono for request handling
- Add request context with route method dispatch (GET, POST, HEAD)
- Add HTML shell with runtime script injection
- Add app stylesheet link injection
- Add public static file serving
- Add island placeholders in route HTML output

---

## M4 — Development Asset Pipeline

- Add esbuild wrapper with Deno loader plugin
- Add on-demand runtime, island, and CSS compilation
- Add sourcemap routes
- Add single-flight build cache coalescing concurrent identical compiles
- Add input-set invalidation tracking mtime changes
- Add `cache-control: no-store` for development assets

---

## M5 — CLI MVP

- Add `sprout init` creating a runnable app scaffold
- Add `sprout dev` serving the generated app with live asset recompilation
- Add `sprout build` placeholder
- Add `sprout serve` development-backed production-style serve
- Add `sprout inspect` printing routes and islands
- Add human-readable error formatting

---

## M6 — Production Build

- Add safe outDir emptying with unsafe path rejection
- Add content-hashed asset filenames
- Add frozen manifest mapping stable public paths to hashed files
- Add gzip companions when configured
- Add content type resolution for build output
- Add build summary output

---

## M7 — Production Serve

- Add frozen manifest loader at startup
- Add O(1) public path index for asset lookup
- Add lazy asset byte reads (do not load all bytes on startup)
- Add gzip negotiation respecting `gzip;q=0`
- Add ETag handling with `If-None-Match` returning `304`
- Add immutable cache headers for hashed assets
- Add optional bounded LRU for asset bytes

---

## M8 — Hardening and Security

- Add path traversal tests and guards
- Add public URL collision tests
- Add props size tests and limits
- Add malformed config, route, and island module tests
- Add per-command Deno permission documentation
- Add stable typed error codes for every public failure mode
- Add security docs covering paths, public URL namespace, props serialization, and outDir safety

---

## M9 — Documentation and Examples

- Add getting started guide
- Add routes guide covering route module contract and method dispatch
- Add islands guide covering island module contract and mount loop
- Add config guide covering `defineConfig` options
- Add build and deploy guide covering `sprout build` and `sprout serve`
- Add five examples: basic, blog, forms, nested routes, island composition
- Examples avoid manual island registration and user-authored mount wrappers

---

## v0.2.0 (M10 — Release Candidate)

First JSR-publishable release. All packages bump to `0.2.0`.

### Package versions

- `@sprout/utils` `0.2.0`
- `@sprout/config` `0.2.0`
- `@sprout/compiler` `0.2.0`
- `@sprout/jsx` `0.2.0`
- `@sprout/runtime` `0.2.0`
- `@sprout/core` `0.2.0`
- `@sprout/cli` `0.2.0`

### Changes

- Pin all JSR dependencies to explicit versions
- Add per-package `README.md` with description, license, and usage
- Add top-level `CHANGELOG.md` with per-milestone release notes
- Add end-to-end smoke tests against generated app
- Run `deno publish --dry-run` gate in CI
- Add public API surface documentation
- Add Deno v2.8+ compatibility matrix
- Clean up publish exclusions to remove internal test utilities from JSR surface
