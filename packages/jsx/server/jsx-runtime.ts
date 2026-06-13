// Server JSX runtime for Sprout.
//
// The runtime re-exports Hono's server-side JSX helpers and wraps the
// `jsx` factory so that, when the JSX tag is a function component that
// has been registered as an island, the runtime emits a placeholder
// `div` instead of executing the component on the server.
//
// Intrinsic tags (strings) and unregistered function components pass
// through to Hono unchanged. The wrapper also adapts the TypeScript
// `react-jsx` shape — `jsxs(tag, { children: [...] })` — into
// Hono's positional-children shape — `honoJsx(tag, props, ...children)`
// — so that user-authored JSX with multiple children renders correctly
// even though Hono's `JSXNode.toStringToBuffer` reads `this.children`
// rather than `this.props.children`.
import { Fragment, jsx as honoJsx } from "jsr:@hono/hono@4.12.24/jsx";
import type { Child, JSXNode } from "jsr:@hono/hono@4.12.24/jsx";
import { buildIslandPlaceholder } from "./island_placeholder.ts";
import { lookupIslandMetadata } from "./island_registry.ts";
import type { IslandMetadata } from "./island_registry.ts";

/**
 * Normalize the `children` argument into a positional array.
 *
 * TypeScript's `react-jsx` compilation passes children inside `props`
 * (`jsxs(tag, { children: [...] })`). Hono's runtime, by contrast,
 * reads children positionally (`honoJsx(tag, props, ...children)`).
 * The wrapper accepts both shapes: positional children win, then
 * `props.children`, then an empty array.
 */
function resolveChildren(
  props: Record<string, unknown> | null,
  rest: readonly Child[],
): Child[] {
  if (rest.length > 0) {
    return [...rest];
  }
  if (props === null) {
    return [];
  }
  const c = (props as { children?: unknown }).children;
  if (c === undefined || c === null || c === false) {
    return [];
  }
  if (Array.isArray(c)) {
    return c as Child[];
  }
  return [c as Child];
}

/**
 * A function-component tag. The signature uses `never` parameters and
 * an `unknown` return so any user-defined function component
 * (regardless of its prop shape) is assignable. The runtime only
 * inspects the tag with `typeof tag === "function"` and (for
 * registered islands) `lookupIslandMetadata`; it never actually
 * invokes a typed call against the user component.
 */
type ComponentTag = (...args: never) => unknown;

/**
 * Wrapped `jsx` factory. Hono only ships a single `jsx` function; the
 * Sprout wrapper exists so the runtime can intercept island component
 * tags before they execute on the server.
 *
 * The signature mirrors Hono's `jsx(tag, props, ...children)`. The
 * runtime also supports `jsx(tag, props)` with `props.children` set,
 * which is how TypeScript's `react-jsx` mode compiles multi-child
 * JSX.
 *
 * @param tag Intrinsic element name or function component reference.
 * @param props Element/component props; may be `null` for tag-only use.
 * @param children Optional rest children; the runtime ignores them for
 *   registered islands because the placeholder replaces the tree.
 */
function jsx(
  tag: string | ComponentTag,
  props: Record<string, unknown> | null,
  ...children: Child[]
): JSXNode {
  if (typeof tag === "function") {
    const metadata: IslandMetadata | undefined = lookupIslandMetadata(tag);
    if (metadata !== undefined) {
      // We discard `children` on purpose: the placeholder replaces the
      // server-rendered tree. The actual children will be re-rendered on
      // the client after the island module is loaded.
      return buildIslandPlaceholder(metadata, props ?? {});
    }
  }
  const resolved = resolveChildren(props, children);
  return honoJsx(tag as never, props, ...resolved);
}

/**
 * `jsxs` is the same as `jsx` for our purposes. Hono does not
 * distinguish the two, but the JSX spec calls for both names and user
 * code may rely on either.
 */
const jsxs: typeof jsx = jsx;

export { Fragment, jsx, jsxs };
export type { JSX } from "jsr:@hono/hono@4.12.24/jsx";
export type { IslandMetadata } from "./island_registry.ts";
