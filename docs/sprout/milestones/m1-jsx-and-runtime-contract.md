# Sprout Build Plan

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
