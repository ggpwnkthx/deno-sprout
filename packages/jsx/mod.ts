/**
 * @ggpwnkthx/sprout-jsx
 *
 * JSX rendering, components, and streaming support for the Sprout framework.
 *
 * This package provides:
 * - {@link createJsxRenderer} and {@link Fragment} / {@link memo} for layout
 *   rendering and component memoization
 * - {@link InvalidLayoutError} for typed error handling when a layout is invalid
 * - {@link FC} and {@link PropsWithChildren} type helpers for typed components
 * - {@link renderToReadableStream}, {@link renderToString}, and {@link Suspense}
 *   for streaming or string-based rendering
 * - {@link createContext} and {@link useContext} for component-tree state
 *
 * @example
 * ```tsx
 * // Set up a JSX renderer with an optional root layout
 * app.use(createJsxRenderer(rootLayout));
 * ```
 *
 * @example
 * ```tsx
 * // Render a component to a plain HTML string
 * const html = await renderToString(<MyPage />);
 * ```
 *
 * @example
 * ```tsx
 * // Typed functional component
 * const Card: FC<{ title: string }> = ({ title, children }) => (
 *   <div class="card">
 *     <h1>{title}</h1>
 *     <div>{children}</div>
 *   </div>
 * );
 * ```
 */
export {
  createJsxRenderer,
  Fragment,
  InvalidLayoutError,
  memo,
} from "./renderer.ts";
export type { FC, PropsWithChildren } from "./components.ts";
export {
  renderToReadableStream,
  renderToString,
  Suspense,
} from "./streaming.ts";
export { createContext, useContext } from "./hooks.ts";
