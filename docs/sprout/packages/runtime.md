# Sprout Build Plan

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
  MountIslandOptions,
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
export async function mountAll(root?: ParentNode | null, options?: MountIslandOptions): Promise<readonly IslandMountResult[]>;
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
