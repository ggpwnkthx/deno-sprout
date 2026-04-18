// hydrator.ts - Island hydration helpers
import type { FC } from "@hono/hono/jsx";
import { serializeProps } from "./serializer.ts";
import { renderToString } from "@hono/hono/jsx/dom/server";

export type HydrationStrategy = "immediate" | "visible" | "idle";

export interface IslandProps<P extends Record<string, unknown>> {
  /** Island name — must match the file name in islands/ (without extension). */
  name: string;
  /** The actual island component to render during SSR. */
  component: FC<P>;
  /** Props forwarded to the component. Also serialised for browser hydration. */
  props: P;
  /**
   * When to hydrate:
   *   "immediate" — as soon as the bundle loads (default)
   *   "visible"   — when the container enters the viewport (IntersectionObserver)
   *   "idle"      — during browser idle time (requestIdleCallback)
   */
  strategy?: HydrationStrategy;
}

/**
 * SSR wrapper for an island component.
 *
 * Renders:
 *   <div
 *     data-island="Counter"
 *     data-props="<base64>"
 *     data-strategy="immediate"
 *     data-key="counter-0"
 *   >
 *     <!-- SSR output of component(props) -->
 *   </div>
 */
export function Island<P extends Record<string, unknown>>(
  props: IslandProps<P>,
): ReturnType<FC<P>> {
  const strategy = props.strategy ?? "immediate";
  const serializedProps = serializeProps(props.props);
  const ssrOutput = renderToString(props.component(props.props as P));

  // Generate a deterministic key from name + props hash
  const key = `${props.name}-${simpleHash(serializedProps)}`;

  return `<div data-island="${props.name}" data-props="${serializedProps}" data-strategy="${strategy}" data-key="${key}">${ssrOutput}</div>` as unknown as ReturnType<
    FC<P>
  >;
}

/** Simple deterministic hash for the data-key attribute. */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
