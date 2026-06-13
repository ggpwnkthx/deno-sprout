# Sprout Build Plan

## M4 — Development Asset Pipeline

### Goals

Compile runtime, app CSS, and islands on demand in development.

### Deliverables

- esbuild wrapper;
- runtime asset compile;
- virtual island entry compile;
- CSS compile;
- sourcemap routes;
- single-flight build cache;
- input-set invalidation.

### Exit Criteria

- Browser can load `/@sprout/runtime.js`.
- Browser can load `/@sprout/island/Counter.js`.
- Editing an island invalidates the dev bundle.
- Editing a transitive import invalidates the dev bundle.
- Development assets use `cache-control: no-store`.

---
