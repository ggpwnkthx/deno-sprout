# `@ggpwnkthx/sprout-islands`

Selective hydration, prop serialization, and lightweight client-side reactivity
for Sprout.

## What this package is for

`@ggpwnkthx/sprout-islands` provides the runtime and helpers needed to build
**interactive islands** on top of otherwise server-rendered HTML.

An island is a component that:

1. renders on the server for fast first paint and HTML-first delivery,
2. embeds its props and hydration metadata into the page,
3. loads a small browser bundle only when needed, and
4. hydrates client-side to enable interactivity.

In the current `0.1.0` model, hydration is intentionally simple:

- server-side rendering produces HTML immediately,
- the browser runtime finds island containers,
- the island bundle is loaded lazily,
- the component is rendered again in the browser, and
- the island container's `innerHTML` is fully replaced once.

This package is **not** a DOM reconciler or virtual-DOM framework. It is a
focused selective-hydration layer.

## How it fits into Sprout

Within Sprout, this package is the interactivity layer that connects:

- **server rendering** of island markup,
- **build/dev tooling** that emits browser-side island bundles,
- **runtime loading** from `/_sprout/islands/{name}.js`, and
- **browser hydration scheduling** (`immediate`, `visible`, or `idle`).

The broader Sprout flow looks like this:

1. A page is rendered on the server.
2. Interactive components are wrapped with `Island(...)`.
3. `Island(...)` emits:
   - SSR HTML
   - `data-island`
   - `data-props`
   - `data-strategy`
   - `data-key`
4. Sprout build tooling generates an island wrapper module for each island.
5. The browser runtime scans the page for `[data-island]` elements.
6. Each island is hydrated according to its strategy:
   - `immediate`: hydrate as soon as possible
   - `visible`: hydrate when it enters the viewport
   - `idle`: hydrate when the browser is idle

This lets Sprout keep most of the page static and server-rendered while only
paying the client-side cost for the components that actually need interactivity.

## Package responsibilities

This package currently covers five jobs.

### 1. SSR island wrapper generation

`Island(...)` renders server HTML and attaches the metadata the browser runtime
needs later.

```ts
import { Island } from "@ggpwnkthx/sprout-islands";

const html = Island({
  name: "Counter",
  component: Counter,
  props: { initial: 1 },
  strategy: "visible",
});
```

This produces markup conceptually like:

```html
<div
  data-island="Counter"
  data-props="...base64..."
  data-strategy="visible"
  data-key="Counter-abc123"
>
  <!-- SSR output -->
</div>
```

### 2. Prop serialization

`serializeProps()` and `deserializeProps()` move island props safely between
server and browser using Base64-encoded JSON.

This is what allows SSR output to carry enough information for later hydration.

### 3. Browser hydration runtime

`lib/runtime.ts` is the browser entrypoint that:

- discovers island containers,
- decodes props,
- fetches the island bundle,
- dynamically imports it,
- and invokes the bundle's default hydrate function.

### 4. Island wrapper template generation

`generateIslandWrapper(name)` generates the browser-side module source for a
specific island. In Sprout, build tooling uses this to wire the island component
to `mount(...)`.

### 5. Lightweight client-side reactivity

The package ships a small reactive core and hook-like helpers:

- `signal`
- `computed`
- `effect`
- `batch`
- `useSignal`
- `useComputed`
- `useEffect`

These are intended to support interactive client-side behavior inside hydrated
islands.

## Current rendering model and limitations

The current implementation is deliberately minimal.

### Full replace hydration

`mount(...)` renders the component to a string and then assigns `el.innerHTML`
once.

That means:

- there is no DOM diffing,
- there is no reconciler,
- updates are not automatically patched into the DOM,
- and reactive values do not magically update rendered HTML.

If an island needs post-hydration interactivity in `0.1.0`, it should manage DOM
mutations explicitly, typically through `useEffect(...)` and direct DOM updates.

### Browser/runtime assumptions

The runtime assumes:

- island bundles are available at `/_sprout/islands/{name}.js`,
- a mount runtime is available at `/_sprout/runtime/mount.js`, and
- wrapper modules import island components from `./{name}.tsx`.

Those conventions come from Sprout, but they can be adapted in other projects
with matching build output.

### Not every helper is fully mature yet

A few parts still look early-stage:

- `validateProps(...)` is intentionally loose,
- dispose behavior in `mount(...)` is currently a no-op,
- and the runtime is optimized for simplicity, not completeness.

This package is best understood as a focused first-generation islands
implementation rather than a full client framework.

## Public API

```ts
export { batch, computed, effect, signal } from "./signals.ts";
export type { EffectHandle, ReadonlySignal, Signal } from "./signals.ts";
export { Island, simpleHash } from "./hydrator.ts";
export type { HydrationStrategy, IslandProps } from "./hydrator.ts";
export { deserializeProps, serializeProps } from "./serializer.ts";
export { useComputed, useEffect, useSignal } from "./hooks.ts";
export { mount } from "./lib/mount.ts";
export { generateIslandWrapper } from "./lib/wrapper-template.ts";
```

## Using it inside Sprout

In Sprout, usage is typically split across three layers.

### Server-side page rendering

Wrap interactive components with `Island(...)` during SSR.

```ts
import { Island } from "@ggpwnkthx/sprout-islands";

function Page() {
  return `
    <main>
      <h1>Dashboard</h1>
      ${
    Island({
      name: "Counter",
      component: Counter,
      props: { initial: 5 },
      strategy: "visible",
    })
  }
    </main>
  `;
}
```

### Build tooling

Sprout build/dev tooling is expected to:

- generate island wrapper modules,
- bundle each island for the browser,
- expose those bundles at `/_sprout/islands/{name}.js`, and
- expose the mount runtime used by the generated wrappers.

### Browser runtime bootstrap

The runtime auto-bootstraps when loaded in a browser. It waits for
`DOMContentLoaded` if necessary and then hydrates all discovered islands.

## Using it outside Sprout

This package is not Sprout-only. The core ideas are portable.

You could reuse it in another project if you want:

- SSR-first rendering,
- opt-in client interactivity,
- delayed hydration,
- tiny reactive primitives,
- and a lighter-weight alternative to adopting a larger client framework.

### What an external project would need

To use this package outside Sprout, another project would need to provide the
same integration points that Sprout does:

1. **SSR integration**
   - Render `Island(...)` output into server-generated HTML.

2. **Asset pipeline**
   - Generate one browser bundle per island.
   - Serve each bundle at a predictable URL.

3. **Wrapper generation**
   - Use `generateIslandWrapper(name)` or an equivalent mechanism.

4. **Runtime delivery**
   - Ship the browser runtime and mount module to the client.

5. **Component authoring discipline**
   - Keep props serializable.
   - Treat hydration as full replace, not incremental diffing.

### Good fit outside Sprout

This package is a good fit for projects that want:

- mostly static or SSR HTML pages,
- a few interactive widgets,
- strong control over bundle size,
- incremental adoption,
- or a custom framework/runtime stack.

Examples:

- marketing sites with a few interactive callouts,
- dashboards with selected interactive panels,
- documentation sites with client-side demos,
- or bespoke SSR platforms that want islands without adopting React/Vue/Solid
  end-to-end.

### Less ideal fit

This package is a weaker fit for applications that need:

- large-scale client-side stateful UI,
- automatic DOM reconciliation,
- rich component lifecycle semantics,
- or framework-level ecosystem tooling out of the box.

For those cases, a full client UI framework may still be the better choice.

## Example: simple island component

```ts
import { useEffect, useSignal } from "@ggpwnkthx/sprout-islands";

export default function Counter(props: { initial: number }) {
  const count = useSignal(props.initial);

  useEffect(() => {
    // In 0.1.0, DOM updates are imperative rather than reconciled.
    const root = document.querySelector('[data-island="Counter"]');
    const valueEl = root?.querySelector("[data-count-value]");
    const button = root?.querySelector("button");

    if (!valueEl || !button) return;

    valueEl.textContent = String(count.value);
    const off = count.subscribe(() => {
      valueEl.textContent = String(count.value);
    });

    const onClick = () => {
      count.value = count.value + 1;
    };

    button.addEventListener("click", onClick);

    return () => {
      off();
      button.removeEventListener("click", onClick);
    };
  });

  return `
    <div>
      <span data-count-value>${count.value}</span>
      <button type="button">Increment</button>
    </div>
  `;
}
```

## Design summary

In one sentence:

> `@ggpwnkthx/sprout-islands` is Sprout's selective hydration layer for shipping
> SSR-first pages with opt-in client-side interactivity.

In slightly more detail:

- it wraps SSR output with hydration metadata,
- serializes props from server to browser,
- loads island bundles lazily,
- hydrates on a chosen schedule,
- and provides a small reactive core for interactive behavior.

That makes it useful both as a core Sprout subsystem and as a reusable islands
foundation for other SSR-oriented projects.
