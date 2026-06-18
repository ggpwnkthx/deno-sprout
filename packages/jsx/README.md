# @sprout/jsx

Server and browser JSX runtimes for Sprout. Server emits island placeholders; browser mounts the
placeholders into the DOM.

`@sprout/jsx` is the framework's JSX runtime. It provides a server runtime (used by route files via
`jsxImportSource: "@sprout/jsx"`) that intercepts registered island components and emits a
placeholder `div` instead of executing the component on the server. The browser runtime
(`@sprout/jsx/dom`) is the target for island bundles (`jsxImportSource: "@sprout/jsx/dom"`); the
shared helpers (`@sprout/jsx/shared`) provide JSON prop serialization, parsing, and the stable
`RuntimeError` types.

## Public surface

### `@sprout/jsx` (server)

- `Fragment` — the JSX fragment component, re-exported from the server runtime. Server routes
  compile with `jsxImportSource: "@sprout/jsx"`.
- `jsx(tag, props, ...children)` — the server-side `jsx` factory. When the `tag` is a function
  component that has been registered as an island (via `registerIslandComponent`), the runtime emits
  a placeholder `div` instead of executing the component. Intrinsic tags and unregistered function
  components pass through to Hono unchanged.
- `jsxs(tag, props, ...children)` — same as `jsx` for the server runtime. Hono does not distinguish
  the two; the JSX spec calls for both names.
- `JSX` — the `JSX` namespace type re-exported from the server runtime. Use this for typing JSX
  expressions in route files.

### `@sprout/jsx/server` (server subpath)

The `@sprout/jsx/server` subpath exposes the server runtime directly for frameworks that need
finer-grained control over the JSX factory than the top-level `@sprout/jsx` re-export provides.

- `Fragment` — the JSX fragment component.
- `jsx(tag, props, ...children)` — the server JSX factory (same as `@sprout/jsx`).
- `jsxs(tag, props, ...children)` — alias of `jsx`.
- `ComponentTag` — the function-component tag type (`(...args: never) => unknown`). Use this to type
  island component references.
- `IslandMetadata` — the metadata shape stored in the registry.
- `registerIslandComponent(component, metadata)` — register a function component as an island. The
  `component` must be a function reference; the registry is keyed by function identity (a
  `WeakMap`). Re-importing a module produces a different function reference and therefore a
  different registry key.
- `lookupIslandMetadata(component)` — read the metadata for a registered component, or `undefined`
  when the component is not registered.
- `clearIslandRegistry()` — no-op. The registry is a `WeakMap`; entries are garbage-collected when
  the function reference is no longer reachable. This function is kept for API stability.

### `@sprout/jsx/jsx-runtime` (jsx-runtime subpath)

Alias for `@sprout/jsx/server`. Used by the TypeScript `jsx` runtime pragma.

### `@sprout/jsx/jsx-dev-runtime` (jsx-dev-runtime subpath)

Alias for `@sprout/jsx/server` in development mode.

### `@sprout/jsx/dom` (browser)

- `Fragment` — the JSX fragment component for island bundles. The browser runtime uses the
  React-style `jsx(tag, props, key?)` signature.
- `jsx(tag, props, key?)` — the browser-side `jsx` factory. Re-export of Hono's DOM `jsx-runtime`.
- `jsxs(tag, props, key?)` — same as `jsx` for the browser runtime.
- `render(node, container)` — render a JSX node into a DOM container. Re-export of Hono's `render`
  helper.
- `JSX` — the `JSX` namespace type re-exported from the browser runtime.

### `@sprout/jsx/shared` (shared helpers)

- `serializeJsonProps(value, maxChars?)` — serialize a JavaScript value as JSON for an island
  placeholder. The top-level value must be a plain object record; cycles, `undefined`, functions,
  `bigint`, `Date`, class instances, maps, sets, and typed arrays are rejected. The serialized
  string is bounded by `maxChars` (default `DEFAULT_MAX_SERIALIZED_PROPS_CHARS`). `maxChars` of `0`
  or a negative value always throws `PROPS_TOO_LARGE` for any non-empty record.
- `parseJsonProps(text)` — parse a JSON-serialized island props string into a plain object record.
  Throws `RuntimeError` on invalid JSON or non-record top-level values.
- `DEFAULT_MAX_SERIALIZED_PROPS_CHARS` — the default cap (65 536 characters) for the JSON-serialized
  island props.
- `RuntimeError` — typed error class used by the JSX and runtime contract. `code` is one of
  `RuntimeErrorCode`; `details` is a frozen, JSON-serializable object.
- `RuntimeErrorCode` — the closed union of stable error codes: `INVALID_PROPS`, `PROPS_TOO_LARGE`,
  `INVALID_PLACEHOLDER`, `MOUNT_FAILED`.
- `JsonPrimitive`, `JsonValue`, `JsonRecord` — the canonical JSON shapes used by
  `serializeJsonProps` / `parseJsonProps`.

### `@sprout/jsx/server/island-registry` (framework subpath)

- `registerIslandComponent(component, metadata)` — register a function component as an island. The
  server JSX runtime checks the registry when JSX receives a component tag and emits a placeholder
  when the component is registered.
- `clearIslandRegistry()` — clear the registry. Intended for framework tests and controlled
  framework setup.
- `lookupIslandMetadata(component)` — read the metadata for a registered component, or `undefined`
  when the component is not registered. Used by the server JSX runtime.
- `IslandMetadata` — the metadata shape stored in the registry.

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Islands docs](https://jsr.io/@sprout/core) — the user-facing island guide, linked from
  `@sprout/core`'s JSR page.

## License

MIT
