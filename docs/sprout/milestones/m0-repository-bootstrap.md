# Sprout Build Plan

## M0 — Repository Bootstrap

### Goals

Create a strict, Deno-native workspace with package boundaries and CI tasks.

### Deliverables

- workspace `deno.jsonc`;
- package folders;
- root `deno task check`;
- root `deno task test`;
- root `deno task fmt`;
- root `deno task lint`;
- shared TypeScript compiler options;
- import map strategy;
- initial README.

### Exit Criteria

- `deno task check` succeeds with empty package skeletons.
- No package has a dependency cycle.
- All packages declare JSR names and exports.

---
