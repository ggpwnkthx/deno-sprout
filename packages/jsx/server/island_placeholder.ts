// Build the island placeholder `JSXNode` for the server runtime.
//
// The placeholder is a `<div>` element that carries three stable
// `data-sprout-*` attributes:
//   - `data-sprout-island`: the island id
//   - `data-sprout-src`: the public module URL
//   - `data-sprout-props`: the JSON-serialized props
//
// Two additional `data-sprout-*` attributes are reserved for the
// runtime to set on the client after a successful mount (`mounted`)
// or a failure (`error`).
//
// The server-side `serializeJsonProps` call performs full prop
// validation, so the placeholder builder doubles as the rejection
// path for invalid props.
import { jsx } from "@hono/hono/jsx";
import type { JSXNode } from "@hono/hono/jsx";
import { serializeJsonProps } from "../shared/mod.ts";
import type { IslandMetadata } from "./island-registry.ts";

/**
 * Reserved client-runtime attributes that the server never emits.
 * The server only emits the three contract attributes; the runtime
 * owns `data-sprout-mounted` and `data-sprout-error`.
 */
export const RUNTIME_PLACEHOLDER_ATTRS = [
  "data-sprout-island",
  "data-sprout-src",
  "data-sprout-props",
] as const;

export type RuntimePlaceholderAttr =
  | "data-sprout-island"
  | "data-sprout-src"
  | "data-sprout-props"
  | "data-sprout-mounted"
  | "data-sprout-error";

/**
 * Build a placeholder `JSXNode` for a registered island component.
 *
 * `props` is forwarded to `serializeJsonProps` and must be a plain
 * JSON-compatible record. Validation errors and oversize errors
 * surface as `RuntimeError` from `@sprout/jsx/shared`.
 */
export function buildIslandPlaceholder(
  metadata: IslandMetadata,
  props: unknown,
): JSXNode {
  const serialized = serializeJsonProps(props);
  return jsx(
    "div",
    {
      "data-sprout-island": metadata.id,
      "data-sprout-src": metadata.src,
      "data-sprout-props": serialized,
    },
  );
}
