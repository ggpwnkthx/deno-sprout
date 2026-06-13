# Sprout Build Plan

## M5 — CLI MVP

### Goals

Provide end-to-end user commands.

### Deliverables

- `sprout init`;
- `sprout dev`;
- `sprout build` placeholder or partial production build;
- `sprout serve` placeholder or development-backed serve;
- `sprout inspect`;
- human-readable error formatting.

### Exit Criteria

- `init` creates a runnable app.
- `dev` serves the generated app.
- `inspect` prints routes and islands.
- CLI tests do not call `Deno.exit()` directly.

---
