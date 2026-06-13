# island-composition

A page with three islands side-by-side. Each island is independent: the Counter takes a
server-supplied `initial` prop, the Timer has no props at all, and the ThemeToggle persists to
`localStorage`. The example shows what "props from a parent route" looks like when a single route
renders multiple islands.

## What it shows

- **Multiple islands on one page.** The home route renders `<Counter>`, `<Timer>`, and
  `<ThemeToggle>`. Each island is a separate `data-sprout-island` placeholder in the HTML.
- **Props flowing from a server route to a child island.** The Counter's `initial` prop is the
  literal `3` in the route's source. The framework serializes the prop into the `data-sprout-props`
  attribute, and the client runtime re-applies it on mount.
- **A no-prop island.** The Timer has no props; the placeholder carries an empty props object. The
  island's only state is internal to the client.
- **An island that touches `localStorage` and the DOM directly.** The ThemeToggle toggles a
  `data-theme` attribute on `<html>` and reads / writes `localStorage`. The server-rendered page
  does not know which theme the user has chosen; the island's client-side mount owns that decision.
- **CSS theming.** The stylesheet uses the `[data-theme="dark"]` attribute selector to swap colors.
  The Toggle island writes the attribute; the CSS reads it. CSS Modules are post-MVP; attribute
  selectors are the M9 way to theme from an island.

The example deliberately does NOT show:

- Shared state between islands. Sprout's M9 release has no cross-island state primitive; each island
  is independent. The "shared state" pattern is "lift the state into a parent island that owns the
  children" (left as an exercise for the reader; this example shows the simpler "three independent
  islands" case).
- Island lifecycle helpers like `useEffect`. Sprout's M9 release does not have a typed hooks API;
  islands use the standard browser DOM APIs (e.g. `setInterval`, `addEventListener`,
  `localStorage`).

## How to run it

From this directory:

```sh
deno task dev
```

The CLI prints:

```text
[sprout] listening on http://localhost:8000
```

Open <http://localhost:8000> in a browser. You should see the three islands mounted. Click the theme
toggle; the page colors invert. Reload the page; the theme persists.

To build for production:

```sh
deno task build
deno task serve
```

## What to look at

- `src/routes/index.tsx` — the home route. Imports the three islands and renders them in `<section>`
  blocks. The Counter's `initial` prop is the literal `3`; the Timer and ThemeToggle have no props.
- `src/islands/Counter.tsx` — the Counter island. The standard "default-exported component with a
  typed `initial` prop" shape.
- `src/islands/Timer.tsx` — the Timer island. No props. The placeholder shows a placeholder clock;
  on mount the island starts ticking once per second.
- `src/islands/ThemeToggle.tsx` — the ThemeToggle island. Toggles a `data-theme` attribute on
  `<html>` and persists the choice in `localStorage`.
- `src/styles/app.css` — the global stylesheet. The `[data-theme="dark"]` selector swaps colors. The
  Toggle island writes the attribute; the CSS reads it.

## Files of interest

| File                          | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `deno.jsonc`                  | Tasks, JSX options, import map.                   |
| `sprout.config.ts`            | The project config.                               |
| `src/routes/index.tsx`        | The `/` home page.                                |
| `src/islands/Counter.tsx`     | The Counter island (server-supplied prop).        |
| `src/islands/Timer.tsx`       | The Timer island (no props).                      |
| `src/islands/ThemeToggle.tsx` | The ThemeToggle island (touches DOM / storage).   |
| `src/styles/app.css`          | The global stylesheet (theme attribute selector). |
| `public/favicon.svg`          | A static file served from `public/`.              |
