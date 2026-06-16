// Public re-exports for `@sprout/jsx/dom`.
//
// The browser runtime adds Hono's `render(jsxNode, container)` so
// `@sprout/runtime` can mount without taking a direct Hono dep.
export { Fragment, jsx, jsxs } from "./jsx-runtime.ts";
export { render } from "@hono/hono/jsx/dom";
export type { JSX } from "./jsx-runtime.ts";
