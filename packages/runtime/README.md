# @sprout/runtime

Browser-only island mounting. The framework-owned mount loop: scans `[data-sprout-src]`
placeholders, imports island modules, validates props, and mounts components.

`@sprout/runtime` is the framework's browser runtime. Application code does not import this package
directly; generated runtime and island wrapper entries import it. The runtime owns three entry
points (`mountAll`, `mountIsland`, `mountComponent`), the typed `RuntimeError` class shared with the
JSX package, and the contract types that generated wrappers use.

## Public surface

- `mountAll(root?, options?)` — scan a `ParentNode` for island placeholders (`[data-sprout-src]`)
  and mount each one. If `root` is omitted, the function falls back to `document` in browser
  environments and throws `MOUNT_FAILED` in non-browser hosts. Already-mounted placeholders
  (`data-sprout-mounted="true"`) are skipped. The function returns one structured
  `IslandMountResult` per element scanned and continues past per-node failures.
- `mountIsland(element, options?)` — mount a single placeholder element. Reads the three
  `data-sprout-*` attributes, validates the `src`, parses the props, dynamic-imports the module,
  calls the default export's `mount(element, props)`, and returns a structured result. On any
  failure the element is marked with `data-sprout-error="<CODE>"` and the function resolves (does
  not throw) with `ok: false`.
- `mountComponent(element, Component, props, renderImpl?)` — render a single component into a
  placeholder element. The runtime is responsible for clearing the placeholder, calling the DOM JSX
  renderer with the supplied component and props, and marking the element as mounted. An optional
  `renderImpl` overrides the DOM render function (used by tests).
- `clearElement(element)` — clear any children from a placeholder element. Exported for tests that
  need to exercise the clearing behavior without invoking the full mount path.
- `DynamicImporter` — the shape of the dynamic importer used by `mountIsland`. The default
  implementation uses the global `import()`. Tests inject a fake to avoid the network.
- `MountIslandOptions` — the options shape accepted by `mountAll` and `mountIsland`. The single
  `_import` field is intended for test injection; production code should rely on the default global
  `import()`.
- `DomRender` — the render-function shape consumed by `mountComponent`. The default implementation
  calls Hono's DOM `render`.
- `IslandClientModule` — the default-export shape of a compiled island bundle. The runtime
  dynamic-imports the module, reads `module.default.mount`, and invokes it with the placeholder
  element and the validated props.
- `IslandMountResult` — the structured result of a single `mountIsland` (or `mountAll`) call. On
  success: `{ ok: true, id, src, element }`. On failure: `{ ok: false, id, src, element, error }`.
- `MountComponent` — the shape generated wrappers use to mount a single component into an element.
- `RuntimeError` — typed error class. `code` is one of `RuntimeErrorCode`; `details` is a frozen,
  JSON-serializable object.
- `RuntimeErrorCode` — the closed union of stable error codes: `INVALID_PROPS`, `PROPS_TOO_LARGE`,
  `INVALID_PLACEHOLDER`, `MOUNT_FAILED`.

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Internals](https://jsr.io/@sprout/core) — the framework internals doc describes the mount loop
  and the virtual island entry.

## License

MIT
