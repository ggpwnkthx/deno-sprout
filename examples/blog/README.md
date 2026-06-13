# blog

A small blog example. Three posts, a list view, a detail view with a dynamic route segment, a JSON
API endpoint, and a tiny LikeButton island. The data layer is an in-memory array — there is no real
database integration in the M9 release.

## What it shows

- **A dynamic route.** `src/routes/blog/[slug].tsx` captures the `slug` segment of the URL. The post
  is looked up from the in-memory data layer with `findPost(props.params.slug)`.
- **A JSON API endpoint.** `src/routes/api/posts.ts` exports a `GET` method handler that returns the
  same data as JSON. The same module shape is used by the `examples/forms/` example.
- **Props flowing from a server route into an island.** The LikeButton's `initial` prop is the
  post's current like count, which lives in the server-side data layer. The island receives the
  count via the placeholder's `data-sprout-props` attribute.
- **Date formatting.** The `Intl.DateTimeFormat` helper renders the ISO date string into a
  human-readable form. The same helper is used on the home page and the detail page.
- **A 404-style fallback.** The detail page returns a "Not found" response when the slug does not
  match a post. The M9 release does not have a typed 404 helper; the example uses a plain page that
  says "Not found".

The example deliberately does NOT show:

- Real persistence. The "like" button does not save the count.
- A POST handler. See [`examples/forms/`](../forms/) for that.
- Route groups or catch-all routes. See [`examples/nested-routes/`](../nested-routes/) for those.

## How to run it

From this directory:

```sh
deno task dev
```

The CLI prints:

```text
[sprout] listening on http://localhost:8000
```

Open <http://localhost:8000> in a browser. You should see the home page with three post titles.
Click a title to navigate to the post detail page. Try `/blog/does-not-exist` to see the "Not found"
response.

The JSON API is at <http://localhost:8000/api/posts>. It returns the same data as the home page, in
JSON form.

To build for production:

```sh
deno task build
deno task serve
```

## What to look at

- `src/routes/index.tsx` — the home page. Renders the post list with formatted dates.
- `src/routes/blog/index.tsx` — the `/blog` index. Same list view, scoped to the `/blog` URL.
- `src/routes/blog/[slug].tsx` — the post detail. The dynamic segment is captured in
  `props.params.slug`. The page reads from `data.ts` and renders the LikeButton island with the
  post's current like count as the `initial` prop.
- `src/routes/api/posts.ts` — the JSON API. A pure API route with a `GET` method handler. No default
  page export.
- `src/islands/LikeButton.tsx` — the island. The `initial` and `slug` props are passed from the
  server page; the island renders them into the button.
- `src/data.ts` — the in-memory data layer. A small `Post` type and a `POSTS` array. The `findPost`
  helper is the lookup.
- `src/styles/app.css` — the global stylesheet.

## Files of interest

| File                         | Purpose                              |
| ---------------------------- | ------------------------------------ |
| `deno.jsonc`                 | Tasks, JSX options, import map.      |
| `sprout.config.ts`           | The project config.                  |
| `src/data.ts`                | The in-memory data layer.            |
| `src/routes/index.tsx`       | The `/` home page.                   |
| `src/routes/blog/index.tsx`  | The `/blog` index.                   |
| `src/routes/blog/[slug].tsx` | The `/blog/:slug` post detail.       |
| `src/routes/api/posts.ts`    | The JSON API endpoint.               |
| `src/islands/LikeButton.tsx` | The LikeButton island.               |
| `src/styles/app.css`         | The global stylesheet.               |
| `public/favicon.svg`         | A static file served from `public/`. |
