// lib/head.ts - Head management for document <head> elements
import { createContext, isValidElement, useContext } from "@hono/hono/jsx";
import type { Context } from "@hono/hono/jsx";

// Type definitions for JSX node structure
interface JsxNode {
  tag: string | ((props: Record<string, unknown>) => unknown);
  props: Record<string, unknown>;
  children?: unknown;
}

const HTML_TAG_NAMES = new Set([
  "title",
  "meta",
  "link",
  "script",
  "style",
]);

function isHtmlTagNode(child: unknown): child is JsxNode {
  if (!isValidElement(child)) return false;
  const node = child as JsxNode;
  // In Hono's JSX runtime, HTML elements are function nodes with a name
  // matching a known HTML tag (e.g. "title", "meta"). Components like <Title>
  // have capitalized names and must be skipped.
  return typeof node.tag === "function" &&
    HTML_TAG_NAMES.has(node.tag.name.toLowerCase());
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

function toHeadEntry(node: JsxNode): HeadEntry {
  const children = typeof node.children === "string"
    ? node.children
    : typeof node.props?.children === "string"
    ? node.props.children
    : undefined;
  return {
    tag: typeof node.tag === "function"
      ? (node.tag.name.toLowerCase() as HeadEntry["tag"])
      : (node.tag as HeadEntry["tag"]),
    attrs: (node.props ?? {}) as Record<string, string>,
    children,
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
    if (isHtmlTagNode(child)) {
      const node = child as JsxNode;
      headManager.add(toHeadEntry(node));
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
