# Sprout Build Plan

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
