# Sprout Build Plan

## M2 — Config and Discovery

### Goals

Resolve project config and discover routes/islands from files.

### Deliverables

- `defineConfig`;
- `loadConfig`;
- route file mapper;
- island file mapper;
- internal manifest type;
- manifest validator;
- `inspect`-style output function.

### Exit Criteria

- A fixture app with nested/dynamic routes produces the expected manifest.
- Duplicate routes fail.
- Duplicate island public paths fail.
- Paths outside root fail.
- No user-authored app manifest exists.

---
