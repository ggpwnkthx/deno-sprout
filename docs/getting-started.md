# Getting started

This guide walks you from `sprout init` to a running app in about five
minutes. By the end you will have a project on disk, a dev server listening on
`http://localhost:8000`, and a working mental model for what the framework
owns and what you write.

If you only have time for one document, read this one. The other guides are
topical deep-dives.

## 1. Install

The `init` command scaffolds a runnable project. Pick a directory name (or
none — `init` with no argument uses the current directory):

```sh
deno run -A jsr:@sprout/cli init my-app
cd my-app
```

To scaffold into the current directory instead:

```sh
deno run -A jsr:@sprout/cli init
```

The CLI writes six files. If the target directory is non-empty, `init`
refuses to overwrite and prints a list of the offending entries; re-run
with `--force` if you want to clobber them.

## 2. What you got

After `init` finishes, your project looks like this:

```text
my-app/
  deno.jsonc              # tasks, JSX compiler options, the import map
  sprout.config.ts        # the (optional) project config
  src/
    routes/
      index.tsx           # the / route
    islands/
      Counter.tsx         # a default-exported Counter island
    styles/
      app.css             # the (optional) global stylesheet
  public/
    .gitkeep              # the public files directory; start empty
```

The six files, in one line each:

- `deno.jsonc` — the `dev`, `build`, and `serve` tasks; the strict
  TypeScript and JSX options; the import map that wires `@sprout/core` and
  friends.
- `sprout.config.ts` — the project's resolved config. The generated version
  is the minimum legal config (`{ root: "." }`).
- `src/routes/index.tsx` — the `/` route. Default-exports a page component.
- `src/islands/Counter.tsx` — the canonical island: a default-exported
  component with a typed `props` parameter.
- `src/styles/app.css` — the global stylesheet, served at `/@sprout/app.css`.
- `public/.gitkeep` — the `public/` directory starts empty. Drop a
  `favicon.svg` or any other static file in there and the framework will
  serve it.

## 3. Run the dev server

From the project root:

```sh
deno task dev
```

The CLI boots the dev server and prints:

```text
[sprout] listening on http://localhost:8000
```

Open <http://localhost:8000> in a browser.

## 4. What you see

The page renders a `<main>` with an `<h1>` and a `<button>`. The
`<h1>` says **Hello, Sprout!** The button is the Counter island, rendered
on the server as a placeholder (`<div data-sprout-island="Counter" ...>`)
and mounted on the client as a real interactive component.

Open the browser's network tab. You will see:

- `GET /` — the HTML page (a 200 with the full HTML shell).
- `GET /@sprout/runtime.js` — the browser runtime module.
- `GET /@sprout/app.css` — the global stylesheet.
- `GET /@sprout/island/Counter.js` — the Counter island bundle.

The browser console should be empty. Click the button; the count goes up.
You are running a real island.

## 5. Edit a route

Open `src/routes/index.tsx` in your editor and change the `<h1>` text.
Save the file, then refresh the page in the browser. The new text appears.
The dev pipeline re-imports the route module on the next request — no
restart, no rebuild.

## 6. Add an island

Drop a new file in `src/islands/`:

```tsx
// src/islands/Hello.tsx
export default function Hello(props: { name: string }) {
  return <p>Hello, {props.name}!</p>;
}
```

Import it from a route and render it:

```tsx
// src/routes/index.tsx
import Hello from "../islands/Hello.tsx";

export default function Home() {
  return (
    <main>
      <h1>Hello, Sprout!</h1>
      <Hello name="world" />
    </main>
  );
}
```

Save both files. The next request bundles the new island and serves it at
`/@sprout/island/Hello.js`. No manifest edit. No mount wrapper. The
framework owns the loop.

## 7. Build for production

```sh
deno task build
```

The CLI prints a summary and writes the built assets to
`.sprout/dist/`:

```text
Built 3 assets into .sprout/dist
  runtime  /@sprout/runtime.js   (+gzip)
  style    /@sprout/app.css      (+gzip)
  island   /@sprout/island/Counter.js   (+gzip)
```

The on-disk layout is:

```text
.sprout/dist/
  sprout.manifest.json     # the frozen manifest
  _sprout/
    runtime.<hash16>.js
    island-Counter.<hash16>.js
    style-app.<hash16>.css
    ... # plus .gz companions when build.compress === "gzip"
```

The hashes are the first 16 characters of the content's SHA-256, so the
filename changes whenever the content changes.

Run the production server:

```sh
deno task serve
```

`sprout serve` reads the frozen manifest once at startup, builds an O(1)
`publicPath → asset` index, and serves the assets with `ETag`, `gzip`,
and `cache-control: public, max-age=31536000, immutable`. See
[Build and serve](build-and-serve.md) for the full contract.

## The five-line mental model

The framework has a small surface; you can hold it all in your head:

- Routes live in `src/routes/**`.
- Islands live in `src/islands/**`.
- Each island is a default-exported component.
- The compiler discovers both, bundles them, and the server wires them.
- No config files for islands. No `main.ts` to maintain. No mount
  wrappers.

Everything else (the manifest, the asset URLs, the public path layout,
the cache headers, the JSX runtime choice) is an internal detail. You
do not author it; the framework does.

## What to read next

- [Routes](routes.md) — file conventions, method exports, dynamic and
  catch-all routes, route groups, the `RequestContext` shape.
- [Islands](islands.md) — the island contract in full, the mount loop,
  what is NOT needed, and the prop serialization rules.
- [Config](config.md) — every `ResolvedConfig` field, defaults, and
  validation rules.
- [Build and serve](build-and-serve.md) — the build output, the
  production serve contract, the `ETag` / `gzip` / immutable cache
  behavior.
- [Deployment](deployment.md) — shipping the built app to Deno Deploy,
  a VPS, or a container.
