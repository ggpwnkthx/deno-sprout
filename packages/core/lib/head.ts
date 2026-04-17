// lib/head.ts - Head management for document <head> elements
import { createContext, isValidElement, useContext } from "@hono/hono/jsx";
import type { Context } from "@hono/hono/jsx";

// Type definitions for JSX node structure
interface JsxNode {
  tag: string;
  props: Record<string, unknown>;
  children?: unknown;
}

export interface HeadEntry {
  tag: "title" | "meta" | "link" | "script" | "style";
  attrs: Record<string, string>;
  children?: string;
}

export interface HeadManagerValue {
  entries: HeadEntry[];
  add(entry: HeadEntry): void;
}

/** React-context carrying the head manager for the current request. */
export const HeadContext: Context<HeadManagerValue | null> = createContext<
  HeadManagerValue | null
>(null);

/** Create a new per-request HeadManager. Pass its value to <HeadContext.Provider>. */
export function createHeadManager(): HeadManagerValue {
  const entries: HeadEntry[] = [];
  return {
    entries,
    add(entry: HeadEntry) {
      entries.push(entry);
    },
  };
}

function toHeadEntry(child: JsxNode): HeadEntry {
  return {
    tag: child.tag as HeadEntry["tag"],
    attrs: (child.props ?? {}) as Record<string, string>,
    children: typeof child.children === "string" ? child.children : undefined,
  };
}

/**
 * Use inside any component to push entries into the document head.
 *
 * Usage:
 *   <Head>
 *     <title>My Page</title>
 *     <meta name="description" content="..." />
 *   </Head>
 */
export function Head(props: { children: unknown }): null {
  const headManager = useContext(HeadContext);
  if (!headManager) return null;

  const { children } = props;
  const arr = Array.isArray(children) ? children : [children];

  for (const child of arr) {
    if (isValidElement(child)) {
      headManager.add(toHeadEntry(child as JsxNode));
    }
  }

  return null;
}

/** Shortcut for pushing a <title> entry. */
export function Title(props: { children: string }): null {
  const headManager = useContext(HeadContext);
  if (!headManager) return null;

  headManager.add({ tag: "title", attrs: {}, children: props.children });
  return null;
}

/** Shortcut for pushing a <meta> entry. */
export function Meta(props: Record<string, string>): null {
  const headManager = useContext(HeadContext);
  if (!headManager) return null;

  headManager.add({ tag: "meta", attrs: props });
  return null;
}
