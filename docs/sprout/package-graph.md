# Sprout Build Plan

## 6. Cross-Package Dependency Rules

Allowed graph:

```text
@sprout/cli
  -> @sprout/core
  -> @sprout/config
  -> @sprout/compiler

@sprout/core
  -> @sprout/config
  -> @sprout/compiler
  -> @sprout/jsx
  -> @sprout/utils

@sprout/compiler
  -> @sprout/config
  -> @sprout/runtime
  -> @sprout/jsx
  -> @sprout/utils

@sprout/runtime
  -> @sprout/jsx
  -> @sprout/utils

@sprout/config
  -> @sprout/utils

@sprout/jsx
  -> @sprout/utils? only for shared error base if needed

@sprout/utils
  -> no Sprout packages
```

Forbidden:

- `@sprout/config -> @sprout/compiler`
- `@sprout/config -> @sprout/core`
- `@sprout/jsx -> @sprout/core`
- `@sprout/runtime -> @sprout/core`
- package cycles of any kind
