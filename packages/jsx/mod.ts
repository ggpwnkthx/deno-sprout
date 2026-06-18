// Public re-exports for `@sprout/jsx` (the server runtime).
//
// Server routes compile with `jsxImportSource: "@sprout/jsx"`. The
// `Fragment`, `jsx`, and `jsxs` re-exports come from the server
// runtime; the browser entry point is `@sprout/jsx/dom`; the shared
// helpers are at `@sprout/jsx/shared`.
export { Fragment, jsx, jsxs } from "./server/jsx-runtime.ts";
export type { JSX } from "./server/jsx-runtime.ts";
