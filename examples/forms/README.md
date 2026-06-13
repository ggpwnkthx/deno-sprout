# forms

A POST handler, JSON response, and the redirect-after-POST pattern. The example shows how a single
endpoint can serve both a form submission (redirecting the user back to the page) and a JSON API
(returning the updated state for a client-side fetch call).

## What it shows

- **A `POST` method handler.** `src/routes/api/contact.ts` exports a `POST` that parses the JSON
  body, increments a counter, and branches on the `Accept` header.
- **A `GET` method handler.** The same route file exports a `GET` that returns the current count as
  JSON. The same endpoint supports two HTTP methods.
- **Content-Type sniffing.** When the request's `Accept` header includes `application/json`, the
  endpoint returns a JSON response. Otherwise it returns a 303 redirect to `/?ok=1`. The branching
  is in user code; the framework just calls the right method handler for the request method.
- **The redirect-after-POST pattern.** The form submits to `/api/contact`. The endpoint redirects to
  `/?ok=1` so a page refresh does not re-submit the form. The home page reads
  `props.url.searchParams.get("ok")` and shows a "Thanks" message when the redirect came back.
- **An island that fetches on mount.** `ContactCounter` polls `/api/contact` once on mount and shows
  the current count. This is the canonical "client makes its own requests" island pattern.

The example deliberately does NOT show:

- Real persistence. The counter is an in-memory `let`; it resets on every server restart.
- Form-data parsing. The endpoint expects a JSON body; a real app would also accept
  `application/x-www-form-urlencoded`.
- Authenticated endpoints. The M9 release does not have a documented auth story; the example is
  unauthenticated.

## How to run it

From this directory:

```sh
deno task dev
```

The CLI prints:

```text
[sprout] listening on http://localhost:8000
```

Open <http://localhost:8000> in a browser. You should see the contact form. Submit it; the page
reloads to `/?ok=1` with a "Thanks" message.

The JSON form of the same endpoint is at <http://localhost:8000/api/contact>. A POST with
`Accept: application/json` returns the JSON response.

To build for production:

```sh
deno task build
deno task serve
```

## What to look at

- `src/routes/index.tsx` — the home page. Renders the contact form. Reads
  `props.url.searchParams.get("ok")` to detect the redirect-after-POST flow.
- `src/routes/api/contact.ts` — the API endpoint. Exports `GET` and `POST` method handlers. The
  `POST` branches on the `Accept` header to return either JSON or a redirect.
- `src/islands/ContactCounter.tsx` — the island. The placeholder shows "Loading..."; on mount the
  island fetches `/api/contact` and updates the displayed count.
- `src/styles/app.css` — the global stylesheet.

## Files of interest

| File                             | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `deno.jsonc`                     | Tasks, JSX options, import map.              |
| `sprout.config.ts`               | The project config.                          |
| `src/routes/index.tsx`           | The `/` home page.                           |
| `src/routes/api/contact.ts`      | The POST / GET endpoint.                     |
| `src/islands/ContactCounter.tsx` | The island that polls the endpoint on mount. |
| `src/styles/app.css`             | The global stylesheet.                       |
| `public/favicon.svg`             | A static file served from `public/`.         |
