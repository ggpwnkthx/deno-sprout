/**
 * JSX runtime compatible with the TypeScript `react-jsx` transform.
 *
 * When `@ggpwnkthx/sprout-jsx` is set as `jsxImportSource`, TypeScript's JSX
 * transform will import `jsx`, `jsxs`, and `Fragment` from this module.
 *
 * This module re-exports Hono's JSX runtime, which provides the same semantics
 * as React JSX (jsx, jsxs, Fragment) for server-side rendering.
 *
 * @example
 * ```json
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@ggpwnkthx/sprout-jsx"
 *   }
 * }
 * ```
 */
export { Fragment, jsx, jsxs } from "@hono/hono/jsx/jsx-runtime";
export type { JSX } from "@hono/hono/jsx/jsx-runtime";
