# Sprout Build Plan

## M6 — Production Build

### Goals

Freeze runtime, island, CSS, and manifest assets.

### Deliverables

- safe outDir emptying;
- hashed asset writing;
- frozen manifest;
- gzip companions;
- content type resolution;
- build summary output.

### Exit Criteria

- `sprout build` writes a complete `.sprout/dist`.
- Frozen manifest maps stable public paths to hashed files.
- Unsafe outDir is refused.
- Gzip files are written when configured.

---
