// Browser DOM JSX runtime for Sprout.
//
// Thin re-export of Hono's DOM JSX helpers. Island bundles compile
// with `jsxImportSource: "@sprout/jsx/dom"`; this module is the
// target.
//
// Hono's `hono/jsx/dom/jsx-runtime` is the "dev" shape that mirrors
// the React `jsx-runtime` exactly: `jsx(tag, props, key?)`. We
// re-export it verbatim. The TypeScript automatic JSX transform
// calls `jsx(tag, props)` or `jsx(tag, props, key)` — never with
// spread children — so this signature is sufficient.
//
// `Fragment` is a function component in Hono's DOM dev runtime; it
// accepts a `children` prop and returns a fragment node.
//
// `render` is re-exported from `hono/jsx/dom` (the package index)
// by the package's `mod.ts`.
export { Fragment, jsx, jsxs } from "jsr:@hono/hono@4.12.24/jsx/dom/jsx-runtime";
export type { JSX } from "jsr:@hono/hono@4.12.24/jsx/dom/jsx-runtime";
