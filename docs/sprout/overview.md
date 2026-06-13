# Sprout Build Plan

## 0. Executive Summary

The new project should optimize for one authoring model:

```tsx
// src/routes/index.tsx
import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Hello</h1>
      <Counter initial={1} />
    </main>
  );
}
```

```tsx
// src/islands/Counter.tsx
export default function Counter(props: { readonly initial: number }) {
  return <button type="button">Count: {props.initial}</button>;
}
```

Application authors should not manually register islands, write island mount wrappers, maintain a `main.ts` manifest, or know which JSX runtime applies to which build target.

The framework owns:

- route discovery;
- island discovery;
- internal manifest generation;
- server JSX placeholder emission;
- browser island mounting;
- generated client island entry modules;
- dev-time on-demand compilation;
- production asset freezing.

The first version should use **client mounting**, not true DOM hydration. Public docs should avoid the word “hydration” unless and until the runtime reconciles existing SSR island DOM.


## 1. Design Goals

1. **Simple server/client DX**
   - Route files are server modules.
   - Island files are browser-capable component modules.
   - JSX works without per-file pragmas.
   - A default-exported island component is enough.

2. **Convention-first, config-second**
   - `src/routes/**` defines route modules.
   - `src/islands/**` defines island modules.
   - `src/styles/app.css` is discovered as the global stylesheet.
   - Explicit config exists for advanced projects but is not required for normal projects.

3. **Compiler-owned internals**
   - Users author components and handlers.
   - The compiler generates manifests, virtual island entries, asset URLs, and build metadata.

4. **Deno-first implementation**
   - Target Deno v2.8+.
   - No Node.js APIs.
   - JSR-only dependency policy.
   - Strict TypeScript everywhere.
   - Deno permission requirements must be documented per command.

5. **Memory-safe defaults**
   - Do not eagerly read large build outputs, public directories, or frozen assets unless needed.
   - Stream static files where possible.
   - Cache metadata separately from file bytes.
   - Keep production asset byte caching opt-in and bounded.

6. **Stable typed errors**
   - Config, discovery, manifest, build, runtime, and HTTP errors should expose stable `code`, `message`, and `details`.
   - Avoid free-form thrown strings from public package boundaries.


## 2. Non-goals for the Initial Release

The first release must deliberately avoid recreating every advanced behavior from the current codebase.

Out of scope for the initial release:

- true DOM hydration;
- partial route prerendering;
- nested layouts;
- streaming SSR;
- route middleware conventions;
- plugin API;
- adapter API for non-Deno runtimes;
- React compatibility;
- server actions;
- user-authored island manifest registration;
- user-authored island mount wrappers;
- custom JSX runtime selection by users;
- arbitrary module-loader thunk extraction.

These may become later milestones, but they should not block a clean MVP.


## 3. Target User-Facing Contract

### 3.1 Project Layout

```text
my-app/
  deno.jsonc
  sprout.config.ts          # optional
  public/
    favicon.ico
  src/
    routes/
      index.tsx             # /
      about.tsx             # /about
      blog/
        [slug].tsx          # /blog/:slug
      api/
        health.ts           # /api/health
    islands/
      Counter.tsx           # /@sprout/island/Counter.js
      cart/
        AddButton.tsx       # /@sprout/island/cart/AddButton.js
    styles/
      app.css               # /@sprout/app.css
```

### 3.2 Minimal Config

```ts
// sprout.config.ts
import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
});
```

`sprout.config.ts` is optional. If missing, the CLI and server assume the project root is the current working directory.

### 3.3 Advanced Config

```ts
import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
  srcDir: "src",
  publicDir: "public",
  outDir: ".sprout/dist",

  routes: {
    dir: "src/routes",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
  },

  islands: {
    dir: "src/islands",
    include: ["**/*.{ts,tsx}"],
    exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
  },

  styles: {
    app: "src/styles/app.css",
  },

  build: {
    compress: "gzip",
    sourcemap: true,
  },
});
```

### 3.4 Route Module Contract

A route module may export:

```ts
import type { PageProps } from "@sprout/core";

export default function Page(props: PageProps) {
  return <main>{props.params.slug}</main>;
}

export async function GET(c: RequestContext): Promise<Response> {
  return c.render(<Page params={c.params} request={c.request} context={c} />);
}

export async function POST(c: RequestContext): Promise<Response> {
  return c.json({ ok: true });
}
```

Supported method exports:

```text
GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
```

Route default export behavior:

- If a matching method export exists, it wins.
- `GET` falls back to the default page export.
- `HEAD` falls back to `GET` or the default page export and strips the body.
- Non-GET methods without a method export return `405 Method Not Allowed`.
- A route module with neither a default export nor a matching method export is a discovery error.

### 3.5 Island Module Contract

An island module should default-export a component:

```tsx
export type CounterProps = {
  readonly initial: number;
};

export default function Counter(props: CounterProps) {
  return <button type="button">Count: {props.initial}</button>;
}
```

Rules:

- The default export must be callable.
- Props must be JSON-serializable when rendered from a server route.
- Island components may import browser-only APIs, but only inside code that runs in the browser.
- Island modules are compiled with the DOM JSX runtime.
- Server route modules may import island components directly and render them as JSX.
- The compiler generates the client mount module. Users do not write `createIsland(Component)`.

### 3.6 Placeholder Contract

Server rendering an island emits a host element:

```html
<div
  data-sprout-island="Counter"
  data-sprout-src="/@sprout/island/Counter.js"
  data-sprout-props="{&quot;initial&quot;:1}"
></div>
```

Required attributes:

| Attribute | Purpose |
| --- | --- |
| `data-sprout-island` | Stable island id for diagnostics. |
| `data-sprout-src` | Public browser module URL. |
| `data-sprout-props` | JSON-serialized props object. |

Runtime-added attributes:

| Attribute | Purpose |
| --- | --- |
| `data-sprout-mounted="true"` | Marks successful mount; repeated `mountAll()` calls skip it. |
| `data-sprout-error="<CODE>"` | Marks failed mount with a stable runtime error code. |

### 3.7 Public CLI

```sh
deno run -A jsr:@sprout/cli init my-app
deno task dev
deno task build
deno task serve
```

Generated project tasks:

```jsonc
{
  "tasks": {
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net jsr:@sprout/cli dev",
    "build": "deno run --allow-read --allow-write --allow-env jsr:@sprout/cli build",
    "serve": "deno run --allow-read --allow-env --allow-net jsr:@sprout/cli serve"
  }
}
```
