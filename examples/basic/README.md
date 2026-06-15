# basic

The canonical Sprout example. The smallest runnable app: a single route, a single island, a single
stylesheet, and a favicon.

This is the example that the [Getting started](../docs/getting-started.md) guide walks through. If
you have not read that guide, read it first; the rest of this README assumes the mental model from
there.

## What it shows

- A `src/routes/index.tsx` that imports an island and renders it.
- A `src/islands/Counter.tsx` with a default-exported component and a typed `props` parameter.
- A `src/styles/app.css` global stylesheet.
- A `public/favicon.svg` static file served from the `public/` directory.
- The minimum legal `sprout.config.ts` (`{ root: "." }`).

The example deliberately does NOT show:

- Method exports. See [`examples/blog/`](../blog/) for that.
- A POST handler. See [`examples/forms/`](../forms/) for that.
- Dynamic or catch-all routes. See [`examples/nested-routes/`](../nested-routes/) for that.
- Multiple islands on one page. See [`examples/island-composition/`](../island-composition/) for
  that.

## How to run it

From this directory:

```sh
deno task dev
```

The CLI prints:

```text
[sprout] listening on http://0.0.0.0:8000
```

Open <http://0.0.0.0:8000> in a browser. You should see an `<h1>` that says **Hello, Sprout!** and a
button that says **Count: 1**.

To build for production:

```sh
deno task build
deno task serve
```

The build output lives in `.sprout/dist/`. The serve command serves it with `ETag` / `gzip` /
`cache-control: immutable`.

## What to look at

- `src/routes/index.tsx` — the only route. Default-exports a page component that imports the Counter
  island and renders it.
- `src/islands/Counter.tsx` — the only island. Default-exports a component with a typed `props`
  parameter. There is no `createIsland` wrapper and no `main.ts` entry.
- `src/styles/app.css` — the global stylesheet, served at `/@sprout/app.css`. The HTML shell
  includes a `<link>` tag for it automatically.
- `public/favicon.svg` — a static file. The framework serves it from the `public/` directory.
- `deno.jsonc` — the import map. The JSR versions are pinned to `0.2.0` for this example; release
  automation pins the real versions in the published `@sprout/cli`.
- `sprout.config.ts` — the minimum legal config.

## Files of interest

| File                      | Purpose                              |
| ------------------------- | ------------------------------------ |
| `deno.jsonc`              | Tasks, JSX options, import map.      |
| `sprout.config.ts`        | The project config.                  |
| `src/routes/index.tsx`    | The `/` route.                       |
| `src/islands/Counter.tsx` | The Counter island.                  |
| `src/styles/app.css`      | The global stylesheet.               |
| `public/favicon.svg`      | A static file served from `public/`. |
