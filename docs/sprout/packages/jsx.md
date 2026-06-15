# Sprout Build Plan

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

Framework server island registry subpath:

```ts
// @sprout/jsx/server/island-registry
export {
  clearIslandRegistry,
  registerIslandComponent,
} from "./server/island_registry.ts";
```

The registry subpath is exported so `@sprout/core` can coordinate with `@sprout/jsx` across package boundaries. Application code should not need it.

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
