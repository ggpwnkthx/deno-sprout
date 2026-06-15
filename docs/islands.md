# Islands

An island is a component that runs on both the server (to render a
placeholder) and the client (after a one-time mount). Sprout's
island system is the smallest possible thing that still feels like
modern web development: a default-exported component, a JSON-serialized
prop contract, and a mount loop that the framework owns end-to-end.

This guide covers the contract, the mount loop, what is NOT needed,
and the boundaries that should make you reach for a non-island
solution instead.

## What an island is

An island is a `.tsx` file under `src/islands/` that default-exports
a component. On the server, the framework renders the component into
a placeholder:

```html
<div
  data-sprout-island="Counter"
  data-sprout-src="/@sprout/island/Counter.js"
  data-sprout-props="&quot;initial&quot;:1"
></div>
```

On the client, the framework's runtime downloads the island's
compiled bundle, parses the props, and mounts the component into the
placeholder element. The server-rendered HTML is replaced; this is
**mounting**, not DOM hydration (true DOM hydration is a
post-MVP feature).

The three required attributes are stable:

| Attribute             | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `data-sprout-island`  | Stable island id for diagnostics.        |
| `data-sprout-src`     | Public browser module URL.               |
| `data-sprout-props`   | JSON-serialized props object.            |

The runtime adds two more attributes after a successful mount or a
failure:

| Attribute                  | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `data-sprout-mounted="true"` | Marks a successful mount; repeated `mountAll` calls skip it. |
| `data-sprout-error="<CODE>"` | Marks a failed mount with a stable runtime error code.    |

You do not need to read or set these attributes in user code. They
exist for diagnostics and for the framework's own bookkeeping.

## The contract

A file is an island if and only if it satisfies the following rules.
The rules are enforced by the framework; violations surface as typed
errors at build or render time, not as silent fallbacks.

**Default export only.** The island module must have a callable
default export. Named exports are not part of the contract. If you
have a "kitchen-sink" file with several components, split it into
several files in `src/islands/`.

**Props must be JSON-serializable.** The framework serializes the
props object with `JSON.stringify` after validating it against the
island prop rules (see [the prop rules](#prop-rules) below). The
serialized string is what the runtime reads on the client. A prop
that fails validation throws an `INVALID_PROPS` error at render time
and never reaches the browser.

**Props are passed once at SSR time and re-applied on the client at
mount time.** The runtime parses the same JSON string the server
wrote and passes the resulting object to the component. There is no
in-band state sharing between the server and the client beyond the
serialized props; the island owns its own client-side state from
mount onward.

**No server state is shared with the client beyond the props.** The
island does not see `Request`, `Response`, `URL`, `RequestContext`,
or any other server object. If an island needs data the server has,
the route passes it through props.

**Default cap on serialized props: 65,536 characters.** The cap is
a default; the framework enforces it so a misconfigured prop cannot
blow up the HTML payload. A larger cap is the call of the application
code; in M9 the cap is not user-configurable.

## A complete island

Here is a complete, runnable island. Save it as
`src/islands/Counter.tsx`:

```tsx
import type { JSX } from "@sprout/core";

export type CounterProps = {
  readonly initial: number;
};

let nextCounterId = 0;

export default function Counter(props: CounterProps): JSX.Element {
  const id = "sprout-counter-" + nextCounterId++;
  let count = props.initial;

  queueMicrotask(() => {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener("click", () => {
      count += 1;
      button.textContent = "Count: " + count;
    });
  });

  return <button id={id} type="button">Count: {count}</button>;
}
```

And a route that renders it:

```tsx
// src/routes/index.tsx
import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Hello, Sprout!</h1>
      <Counter initial={1} />
    </main>
  );
}
```

That is the entire island contract. Save the route, save the island,
refresh the page. The button renders on the server (with the prop
serialized into the placeholder), then mounts on the client as a
live, interactive component.

## The prop rules

The `serializeJsonProps` helper enforces the prop rules. A
`RuntimeError("INVALID_PROPS", ...)` is thrown at SSR time for any
violation. The reason is in `details.reason`.

| Reason             | Trigger                                                  |
| ------------------ | -------------------------------------------------------- |
| `not_record`       | Top-level value is not a plain object record.            |
| `undefined`        | A value (or a nested value) is `undefined`.              |
| `symbol`           | A value is a `Symbol`.                                   |
| `bigint`           | A value is a `bigint`.                                   |
| `function`         | A value is a function.                                   |
| `date`             | A value is a `Date`.                                     |
| `class_instance`   | A value is a class instance (or any non-plain object).   |
| `map`              | A value is a `Map`.                                      |
| `set`              | A value is a `Set`.                                      |
| `typed_array`      | A value is an `ArrayBuffer` or typed array view.         |
| `circular`         | The value (or a nested value) contains a cycle.          |
| `non_finite_number`| A number is `NaN`, `Infinity`, or `-Infinity`.            |
| `json_parse`       | The runtime tried to parse the props string and failed.  |

A `RuntimeError("PROPS_TOO_LARGE", ...)` is thrown when the
serialized string exceeds 65,536 characters. The actual length and
the configured cap are in `details.length` and `details.max`.

## Mounting

When a page loads in the browser, the framework's runtime finds
every `data-sprout-src` placeholder, fetches the island module,
parses the props, and mounts the component into the placeholder.

The framework owns the loop. Your island code does not register
itself, does not call any `mount()` helper, and does not import a
client-side entrypoint. You write the component; the framework
writes the loop.

The runtime is exported from `@sprout/runtime` and shipped as the
`/@sprout/runtime.js` module. The HTML shell automatically includes
it via a `<script type="module">` tag. You do not add the script tag
yourself.

A successful mount sets `data-sprout-mounted="true"` on the
placeholder element; subsequent `mountAll` calls (rare, but the
runtime is idempotent) skip already-mounted placeholders. A failed
mount sets `data-sprout-error="<CODE>"` and the placeholder stays
in the DOM so the page is not blank. The error code is one of the
typed runtime errors (`MOUNT_FAILED`, `INVALID_PLACEHOLDER`, etc.).

## What is NOT needed

The island contract is intentionally small. None of the following
are required; if you find yourself writing any of them, the
framework has a better way.

- **Explicit registration.** You do not call a `registerIsland`
  function or maintain an `islands.ts` manifest. Discovery is
  automatic at build time.
- **A `createIsland()` wrapper.** You do not wrap your component in
  any factory. The default export is the contract.
- **A `main.ts` entry point.** The framework's generated virtual
  entry is the entry; you never see it.
- **A JSX runtime choice.** The dev and production pipelines set
  the runtime to `@sprout/jsx` (server) and `@sprout/jsx/dom`
  (client) automatically. The `jsxImportSource` in your
  `deno.jsonc` is the only knob; you do not select a runtime per
  file.
- **An import map entry per island.** The import map only needs the
  framework's published packages. Individual islands are not
  added.
- **A mount wrapper file.** The framework generates a thin wrapper
  per island at build time. You do not write it.

## When an island is the wrong tool

Islands are right when you have a small, self-contained piece of
client-side interactivity: a counter, a like button, a poll widget,
a collapsible section. They are the wrong tool when the state you
need is shared or large.

- **State shared across users.** Use a server endpoint and an island
  that fetches it. The island's `initial` prop is not the right
  place for live data that other users can change.
- **State shared across islands on the same page, without a parent
  route in between.** The framework does not provide a
  cross-island state primitive. Lift the shared state into a parent
  island that owns the children, or accept that each island starts
  from its own props.
- **State that exceeds 65,536 characters serialized.** The cap is
  enforced at render time. If your prop would exceed it, the data
  belongs in a fetch call from the island, not in the placeholder
  HTML.
- **Anything that needs true DOM hydration.** Sprout's runtime
  mounts; it does not reconcile existing server-rendered HTML. If
  you need true hydration, that is a post-MVP feature.

The "client makes its own requests" pattern is a normal island
use case. The island mounts, calls `fetch` from a `useEffect`-like
hook (or just on click), and updates its own state. The
[`examples/forms/`](../examples/forms/) example shows a counter
that polls a JSON endpoint on mount.
