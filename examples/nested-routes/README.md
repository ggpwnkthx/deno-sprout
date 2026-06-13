# nested-routes

A walk-through of every nested-route pattern: dynamic, catch-all, and route group. The example is
intentionally short; each route file is a one-page explanation of its own pattern.

## What it shows

- **A dynamic route.** `src/routes/blog/[slug].tsx` matches `/blog/:slug` and exposes the captured
  segment as `props.params.slug`. The page echoes the slug so the reader can see the value.
- **A catch-all route.** `src/routes/files/[...path].tsx` matches `/files/:path{.+}` and exposes the
  rest of the URL path (including further slashes) as `props.params.path`. The framework's pattern
  is `:path{.+}` so it only matches a non-empty remainder.

  **M3 catch-all limitation.** The M3 server translates the manifest pattern `/files/:path{.+}` to
  the Hono pattern `/files/:path`, which matches a single path segment rather than many. The
  catch-all is therefore scoped to a single segment in the M3 release. A future milestone can
  revisit the translation strategy; the test asserts the M3 behavior with a single-segment URL.

- **A route group (post-MVP).** `src/routes/(marketing)/about.tsx` and
  `src/routes/(marketing)/careers.tsx` demonstrate the route-group convention: a directory whose
  name is wrapped in parentheses, with the segment dropped from the URL. The M2 discovery layer does
  not yet honor this convention (route groups are on the post-MVP backlog); the M3 server returns
  404 for these URLs. The files are kept in the example to document the convention so a reader can
  see what the pattern looks like in source.

The example deliberately does NOT show:

- Method exports. See [`examples/blog/`](../blog/) and [`examples/forms/`](../forms/) for those.
- Islands. See [`examples/basic/`](../basic/) and
  [`examples/island-composition/`](../island-composition/) for those.

## How to run it

From this directory:

```sh
deno task dev
```

The CLI prints:

```text
[sprout] listening on http://localhost:8000
```

Open <http://localhost:8000> in a browser. The home page links to the four example routes. Click
each link to see the corresponding pattern in action.

To build for production:

```sh
deno task build
deno task serve
```

## What to look at

- `src/routes/index.tsx` — the home page. The four links cover the four nested-route patterns:
  dynamic, catch-all, and two route-group examples.
- `src/routes/blog/[slug].tsx` — the dynamic route. The page echoes `props.params.slug` so the
  reader can see what was captured.
- `src/routes/files/[...path].tsx` — the catch-all route. The page echoes `props.params.path` and
  links to two example multi-segment URLs.
- `src/routes/(marketing)/about.tsx` — a route group example. The page explains the `(marketing)`
  segment.
- `src/routes/(marketing)/careers.tsx` — a second route group example. Both files in the group
  expose a URL with the group segment dropped.
- `src/styles/app.css` — the global stylesheet.

## Files of interest

| File                                 | Pattern                         |
| ------------------------------------ | ------------------------------- |
| `deno.jsonc`                         | Tasks, JSX options, import map. |
| `sprout.config.ts`                   | The project config.             |
| `src/routes/index.tsx`               | The `/` home page.              |
| `src/routes/blog/[slug].tsx`         | Dynamic: `/blog/:slug`.         |
| `src/routes/files/[...path].tsx`     | Catch-all: `/files/:path{.+}`.  |
| `src/routes/(marketing)/about.tsx`   | Route group → `/about`.         |
| `src/routes/(marketing)/careers.tsx` | Route group → `/careers`.       |
| `src/styles/app.css`                 | The global stylesheet.          |
| `public/favicon.svg`                 | A static file.                  |
