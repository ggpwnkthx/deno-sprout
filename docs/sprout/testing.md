# Sprout Build Plan

## 15. Test Strategy

### Unit Tests

Each package owns local `Deno.test` tests for validators, mapping functions, and small runtime behavior.

### Integration Tests

Workspace-level fixtures should test full apps:

```text
tests/fixtures/basic-app
tests/fixtures/nested-routes
tests/fixtures/dynamic-routes
tests/fixtures/island-props
tests/fixtures/broken-config
tests/fixtures/duplicate-routes
tests/fixtures/production-build
```

### Browser-ish Runtime Tests

Use DOM-compatible testing only where necessary. Keep most runtime tests against small fake elements or a minimal DOM test environment.

### Golden Tests

Use golden snapshots for:

- discovered manifest;
- frozen manifest;
- generated virtual island entry;
- CLI init output.

Golden snapshots must be stable across platforms by slash-normalizing paths or replacing root prefixes with `<root>`.
