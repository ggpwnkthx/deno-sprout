# Routes

Routes are the server-rendered part of a Sprout app. A route is a
`.ts` or `.tsx` file under `src/routes/` that exports a default page
component and, optionally, named HTTP method handlers. The framework
discovers the files, maps each to a URL, and dispatches requests.

This guide covers the file conventions, the supported exports, dynamic
and catch-all patterns, route groups, the excluded files, and the
`RequestContext` shape.

## File → URL mapping

The default `src/routes/` directory maps each file to a URL. The
mapping is by directory layout: the path inside `src/routes/` becomes
the URL, with a few conventions.

| File                              | URL pattern              |
| --------------------------------- | ------------------------ |
| `src/routes/index.tsx`            | `/`                      |
| `src/routes/about.tsx`            | `/about`                 |
| `src/routes/blog/index.tsx`       | `/blog`                  |
| `src/routes/blog/[slug].tsx`      | `/blog/:slug`            |
| `src/routes/files/[...path].tsx`  | `/files/:path{.+}`       |
| `src/routes/(marketing)/index.tsx`| `/`                      |
| `src/routes/(marketing)/about.tsx`| `/about`                 |
| `src/routes/_helpers.ts`          | (skipped, no URL)        |
| `src/routes/foo.test.tsx`         | (skipped, no URL)        |

A few notes:

- `index` in any segment represents "the directory itself", so
  `blog/index.tsx` is the `/blog` URL, not `/blog/index`.
- Square brackets around a segment name (e.g. `[slug]`) mark a dynamic
  segment. The captured value is exposed as a string on
  `props.params.slug`.
- Square brackets with `...` (e.g. `[...path]`) mark a catch-all. The
  captured value is the remainder of the path, including `/`; it is
  exposed on `props.params.path`.
- Segments wrapped in parentheses (e.g. `(marketing)`) are
  [route groups](#route-groups) and are dropped from the URL. The
  segments exist only to organize files on disk.
- Files starting with `_` (e.g. `_helpers.ts`) are treated as private
  helpers and excluded by the default `routes.exclude` glob.
- Files matching `*.test.{ts,tsx}` are also excluded by the default
  `routes.exclude` glob.

The exact include / exclude defaults live in the [config guide](config.md);
override them in `sprout.config.ts` if you need different rules.

## Page default export

A route file's default export is the page component. The framework
calls it during server rendering and wraps the result in the HTML
shell.

```tsx
// src/routes/index.tsx
import type { PageProps } from "@sprout/core";

export default function Home(props: PageProps) {
  return <main>Hello, {props.params.name ?? "world"}!</main>;
}
```

`PageProps` is exported from `@sprout/core`. The shape is:

```ts
type PageProps<P = Readonly<Record<string, string>>> = {
  readonly params: P;
  readonly request: Request;
  readonly url: URL;
  readonly context: RequestContext;
};
```

`params` carries dynamic-segment captures (e.g. `{ slug: "hello" }`
for `/blog/hello`). The other fields are the inbound `Request`, the
parsed `URL`, and the framework `RequestContext` (see below).

The page component can return anything that the server JSX runtime
accepts: a Hono `JSXNode`, a string, a `HtmlEscapedString`, or a
`Promise` of any of those.

## Method exports

A route file may also export named HTTP method handlers. The supported
methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, and
`HEAD`. A method export wins over the page default for matching
requests.

```ts
// src/routes/api/contact.ts
import type { RequestContext } from "@sprout/core";

export async function POST(c: RequestContext) {
  const body = await c.request.json();
  // ... process the POST ...
  return c.json({ ok: true });
}

export async function GET(c: RequestContext) {
  return c.json({ items: [] });
}
```

The dispatch rules are:

- A matching method export always wins.
- `GET` falls back to the page default export when there is no `GET`
  handler.
- `HEAD` falls back to `GET` or the page default export when there is
  no `HEAD` handler. The framework strips the response body so the
  semantics match the HTTP spec.
- Any other method without a matching export returns
  `405 Method Not Allowed` with an `Allow` header listing the
  supported methods.
- A route file with neither a default export nor a method export for
  the request method is a server bug; it is rejected at startup as a
  discovery error.

Method handlers receive the `RequestContext` and return a
`Response` (or a `Promise<Response>`). Returning a non-Response value
is treated as a server bug and surfaces as a 500 to the client.

## Dynamic routes

Wrap a segment in square brackets to capture it as a dynamic parameter.
The captured value is the URL-decoded string from the matching path
segment.

```tsx
// src/routes/blog/[slug].tsx
import type { PageProps } from "@sprout/core";

export default function Post(props: PageProps) {
  return <main>Post: {props.params.slug}</main>;
}
```

`/blog/hello-world` renders with `props.params.slug === "hello-world"`.
`/blog/2024/01/15` does not match — there is only one dynamic segment,
and a multi-segment URL would need a different layout.

You can combine dynamic and static segments freely:

| File                                       | URL pattern            |
| ------------------------------------------ | ---------------------- |
| `src/routes/posts/[id]/index.tsx`          | `/posts/:id`           |
| `src/routes/posts/[id]/edit.tsx`           | `/posts/:id/edit`      |
| `src/routes/users/[userId]/posts/[id].tsx` | `/users/:userId/posts/:id` |

## Catch-all routes

Square brackets with `...` mark a catch-all segment. The capture is
the remainder of the path, including `/`. This is the pattern you use
for "everything under here" routes, such as a static-file server, a
catch-all 404, or a wiki with deep paths.

```tsx
// src/routes/files/[...path].tsx
import type { PageProps } from "@sprout/core";

export default function Files(props: PageProps) {
  // /files/a/b/c.txt -> props.params.path === "a/b/c.txt"
  return <main>Serving: {props.params.path}</main>;
}
```

The framework treats the catch-all's pattern as `:path{.+}` so it only
matches a non-empty remainder. A request to `/files/` (no remainder)
does not match the catch-all route.

A catch-all segment must be the last segment in the pattern.

## Route groups

Wrap a segment in parentheses to organize files on disk without
affecting the URL. The segment is dropped from the resulting pattern.

```text
src/routes/
  (marketing)/
    index.tsx       -> /
    about.tsx       -> /about
    careers.tsx     -> /careers
  (app)/
    index.tsx       -> /     <-- would conflict with marketing
    dashboard.tsx   -> /dashboard
```

A few rules:

- The parentheses must wrap the entire segment (`(marketing)`, not
  `(marketing)/about`).
- The dropped segment exists only to group files. Use it to organize
  large apps or to share a convention among related routes.
- A route group can NOT shadow another route's URL. Two files in
  different groups that would resolve to the same URL produce a
  `DISCOVERY_ROUTE_CONFLICT` error at build time.

## Excluded files

The default `routes.exclude` glob is `["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"]`.
Any file matching one of those patterns is skipped at discovery.

Use `_helpers.ts` (or any `_prefix` file) for shared module-level
helpers inside a route directory. Use `*.test.tsx` for colocated
test files. Neither one becomes a URL.

You can override the exclude glob in `sprout.config.ts`. See
[Config](config.md).

## The `RequestContext`

Method handlers and page components both receive a
`RequestContext`. It is the framework's request-scoped object, with
the inbound request, the parsed URL, the dynamic-segment params, a
`locals` map for middleware-supplied data, and a small set of
response helpers.

| Member    | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `request` | The inbound `Request` (the Web Fetch API object).                    |
| `url`     | The parsed `URL` for the request.                                    |
| `params`  | The dynamic-segment captures for the matched route.                  |
| `locals`  | A `Map<string, unknown>` for middleware-supplied per-request data.   |
| `html`    | Build a `text/html` response from any value.                         |
| `json`    | Build a JSON response with `Content-Type: application/json`.         |
| `text`    | Build a `text/plain` response.                                       |
| `redirect`| Build a redirect response. Defaults to `302`.                       |
| `render`  | Wrap a value in the framework's HTML shell (when in a request).     |

The `html`, `json`, `text`, `redirect`, and `render` helpers are
designed to be obvious; they do not transform their arguments in
surprising ways. `json` calls `JSON.stringify`; `redirect` validates
that `location` is a string and falls back to a 4xx response for
invalid inputs.

## A complete route

A route file can mix and match the patterns above. Here is a route
with a default page, a `POST` method handler, and a dynamic segment:

```tsx
// src/routes/notes/[id].tsx
import type { PageProps, RequestContext } from "@sprout/core";

export default function Note(props: PageProps<{ id: string }>) {
  return <main>Note #{props.params.id}</main>;
}

export async function POST(c: RequestContext<{ id: string }>) {
  // ... process the POST ...
  return c.json({ id: c.params.id, ok: true });
}
```

The framework dispatches the request by method, falls back to the
default export for `GET` (and `HEAD`), and surfaces a 405 for any
other method without a matching handler.
