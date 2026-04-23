/**
 * @fileoverview Island hydration helpers for SSR and client-side activation.
 *
 * Provides the {@link Island} component wrapper that renders an island
 * during server-side rendering (SSR) with all metadata needed for
 * client-side hydration. Also exports the {@link HydrationStrategy} type
 * and {@link simpleHash} utility.
 *
 * ## How it works
 *
 * 1. Server renders `<Island name="Counter" component={Counter} props={{count:0}} />`
 * 2. Island outputs a `<div data-island="Counter" data-props="..." data-strategy="...">`
 * 3. Client's `hydrateAll()` reads these attributes and loads the island bundle
 * 4. Bundle calls `mount()` to attach event listeners and activate interactivity
 */

import type { FC } from "@hono/hono/jsx";
import type { HtmlEscapedString } from "@hono/hono/utils/html";
import { serializeProps } from "./serializer.ts";
import { renderToString } from "@hono/hono/jsx/dom/server";

/**
 * Controls when an island is hydrated on the client.
 *
 * - `"immediate"` - Hydrate as soon as the island bundle loads (default)
 * - `"visible"`   - Hydrate when the island enters the viewport via IntersectionObserver
 * - `"idle"`      - Hydrate during browser idle time via requestIdleCallback
 */
export type HydrationStrategy = "immediate" | "visible" | "idle";

/**
 * Escape a string for safe use in an HTML attribute value.
 *
 * Handles the characters that break attribute context: `"`, `<`, `>`, and `&`.
 *
 * @param str - Raw string from an untrusted source (island name or props).
 * @returns The string with HTML-special characters replaced.
 */
function escapeAttr(str: string): string {
  return str.replace(
    /["<>&]/g,
    (c) =>
      c === '"' ? "&quot;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
}

/**
 * Props accepted by the {@link Island} SSR wrapper component.
 *
 * @template P - The props type accepted by the island component
 */
export interface IslandProps<P extends Record<string, unknown>> {
  /**
   * Island name. Must match the island source file name in the islands
   * directory (without extension).
   *
   * Example: `name: "Counter"` corresponds to `islands/Counter.tsx`
   */
  name: string;
  /**
   * The island component to render during SSR and to hydrate on the client.
   * Must be a JSX functional component.
   */
  component: FC<P>;
  /**
   * Props passed to the island component. Must be serializable:
   * no functions, class instances, circular references, or `undefined` values.
   */
  props: P;
  /**
   * When to hydrate the island on the client:
   * - `"immediate"` - As soon as the bundle loads (default)
   * - `"visible"`   - When the island container enters the viewport
   * - `"idle"`      - During browser idle time
   *
   * @default "immediate"
   */
  strategy?: HydrationStrategy;
}

/**
 * SSR wrapper that renders an island component and injects hydration metadata.
 *
 * Produces an HTML string containing a `<div>` with data attributes
 * that client-side hydration code reads to determine what to hydrate:
 *
 * ```html
 * <div
 *   data-island="Counter"
 *   data-props="eyJjb3VudCI6MH0="   <!-- base64-encoded JSON props -->
 *   data-strategy="immediate"
 *   data-key="counter-1a2b3c"
 * >
 *   <!-- SSR HTML output of component(props) -->
 * </div>
 * ```
 *
 * The `data-key` attribute is a deterministic hash of the island name
 * and serialized props, useful for identifying unique island instances.
 *
 * ## Usage
 *
 * ```tsx
 * import { Island } from "@ggpwnkthx/sprout-islands";
 * import { Counter } from "./islands/Counter.tsx";
 *
 * // In a page template:
 * const html = Island({
 *   name: "Counter",
 *   component: Counter,
 *   props: { initialCount: 42 },
 *   strategy: "visible",
 * });
 * ```
 *
 * @template P - The island component's props type
 * @param props - Island configuration including name, component, and props
 * @returns HTML string — a `<div data-island data-props data-strategy data-key>`
 *   containing the SSR-rendered component output. The string return type
 *   reflects Hono's string-based JSX renderer; the cast to `FC` return type
 *   is intentional for JSX compatibility in the template context.
 */
export function Island<P extends Record<string, unknown>>(
  props: IslandProps<P>,
): HtmlEscapedString {
  const strategy = props.strategy ?? "immediate";
  const serializedProps = serializeProps(props.props);
  const ssrOutput = renderToString(props.component(props.props as P));

  // Generate a deterministic key from name + props hash
  const key = `${props.name}-${simpleHash(serializedProps)}`;

  const html = `<div data-island="${
    escapeAttr(props.name)
  }" data-props="${serializedProps}" data-strategy="${strategy}" data-key="${key}">${ssrOutput}</div>`;
  // Mark as HTML-escaped so Hono's JSX renderer passes it through as raw HTML.
  return Object.assign(html, { isEscaped: true }) as HtmlEscapedString;
}

/**
 * Computes a simple deterministic hash of a string.
 *
 * Used to generate the `data-key` attribute on island wrappers,
 * providing a stable identifier for the island instance based on
 * its name and props. The hash is not cryptographic and collisions
 * are possible for very large inputs.
 *
 * @param str - The input string (typically the base64-encoded props)
 * @returns A positive integer represented as a base-36 string
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // Force 32-bit signed integer wrap at each step (djb2 pattern)
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}
