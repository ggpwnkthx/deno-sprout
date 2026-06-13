# Sprout Build Plan

## 7. JSX Build Specification

### Server Compilation

Route files compile with:

```jsonc
{
  "jsx": "automatic",
  "jsxImportSource": "@sprout/jsx"
}
```

Server JSX behavior:

1. If JSX tag is a registered island component reference, emit placeholder.
2. Otherwise delegate to Hono server JSX.

### Island Compilation

Island virtual entries compile with:

```jsonc
{
  "jsx": "automatic",
  "jsxImportSource": "@sprout/jsx/dom"
}
```

Island DOM behavior:

1. Render normal JSX into browser DOM.
2. Support Hono-compatible DOM hooks if provided by the underlying runtime.
3. Never emit island placeholders from browser JSX.

### Dev JSX

Dev mode may use `jsxDEV`, but `jsxDEV` must preserve the same runtime branch behavior as production JSX.
