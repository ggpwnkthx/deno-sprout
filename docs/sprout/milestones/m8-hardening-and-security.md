# Sprout Build Plan

## M8 — Hardening and Security

### Goals

Close common correctness and security gaps before public release.

### Deliverables

- path traversal tests;
- public URL collision tests;
- props size tests;
- malformed config tests;
- malformed route/island module tests;
- permission docs;
- error code docs.

### Exit Criteria

- Every public failure mode has a typed error.
- Every command documents required Deno permissions.
- Security docs cover paths, public URL namespace, props serialization, and outDir safety.

---
