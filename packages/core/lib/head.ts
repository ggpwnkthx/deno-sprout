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

/**
 * Returns `true` if `child` is a JSX element representing a native HTML
 * tag that belongs in `<head>` (`<title>`, `<meta>`, `<link>`, `<script>`,
 * `<style>`). Returns `false` for custom components or non-JSX values.
 *
 * Used internally to filter out framework components (e.g. `<Title>`,
 * `<Meta>`) when collecting raw JSX children inside `<Head>`.
 */
function isHtmlTagNode(child: unknown): child is JsxNode {
  if (!isValidElement(child)) return false;
  const node = child as JsxNode;
  // In Hono's JSX runtime, HTML elements are function nodes with a name
  // matching a known HTML tag (e.g. "title", "meta"). Components like <Title>
  // have capitalized names and must be skipped.
  return typeof node.tag === "function" &&
    HTML_TAG_NAMES.has(node.tag.name.toLowerCase());
}

/**
 * A single entry in the document `<head>`, produced by `toHeadEntry`.
 */
export interface HeadEntry {
  /** HTML tag name. */
  tag: "title" | "meta" | "link" | "script" | "style";
  /** HTML attributes as key-value string pairs. */
  attrs: Record<string, string>;
  /** Tag content for `title` and `style` tags; `undefined` for others. */
  children?: string;
}

/**
 * The value type carried by `HeadContext`. Holds all collected head entries
 * for the current request and provides a method to register new ones.
 */
export interface HeadManagerValue {
  /** All head entries collected so far, in collection order. */
  entries: HeadEntry[];
  /**
   * Register a new head entry. Entries are stored in the array
   * for later rendering by the head manager.
   */
  add(entry: HeadEntry): void;
}

/**
 * React-context providing the per-request head manager.
 *
 * Provide a value by wrapping your app with:
 * ```tsx
 * <HeadContext.Provider value={createHeadManager()}>
 *   {children}
 * </HeadContext.Provider>
 * ```
 *
 * Components inside the provider can use `useContext(HeadContext)` to access
 * the manager and push head entries for the current request.
 *
 * Is `null` when accessed outside a provider (e.g. in API routes that do
 * not render JSX), so guards like `if (!headManager) return null` are
 * necessary in head-collecting components.
 */
export const HeadContext: Context<HeadManagerValue | null> = createContext<
  HeadManagerValue | null
>(null);

/**
 * Create a new per-request head manager.
 *
 * Instantiate once per request (typically in a middleware or provider) and
 * pass the resulting `HeadManagerValue` to `HeadContext.Provider`.
 *
 * @returns A `HeadManagerValue` holding an empty entries list and an `add`
 *   method to register head entries.
 *
 * @example
 * ```tsx
 * const headManager = createHeadManager();
 * export default defineLayout(function Root({ children }) {
 *   return (
 *     <html>
 *       <head>
 *         <HeadContext.Provider value={headManager}>
 *           <Head />
 *         </HeadContext.Provider>
 *       </head>
 *       <body>{children}</body>
 *     </html>
 *   );
 * });
 * ```
 */
export function createHeadManager(): HeadManagerValue {
  const entries: HeadEntry[] = [];
  return {
    entries,
    add(entry: HeadEntry) {
      if (entries.length >= 100) {
        throw new Error("Head entries exceed maximum of 100 per request");
      }
      entries.push(entry);
    },
  };
}

/**
 * Convert a JSX node to a `HeadEntry`.
 *
 * Reads the tag name from `node.tag` (lowercased for HTML tags) and extracts
 * attributes from `node.props`. The `children` field is populated from
 * `node.children` or `node.props.children`, whichever is a plain string.
 */
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
 * Use inside any component to push entries into the document `<head>`.
 *
 * Inspects its children and registers each native HTML tag it finds
 * (e.g. `<title>`, `<meta>`, `<link>`) with the current `HeadManagerValue`
 * from `HeadContext`. Custom components are skipped.
 *
 * Returns `null` so it renders nothing into the component tree.
 *
 * @example
 * ```tsx
 * function AboutPage() {
 *   return (
 *     <div>
 *       <Head>
 *         <title>About Us</title>
 *         <meta name="description" content="We make things." />
 *         <link rel="canonical" href="https://example.com/about" />
 *       </Head>
 *       <h1>About Us</h1>
 *     </div>
 *   );
 * }
 * ```
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

/** Shortcut for pushing a `<title>` entry into the document head. */
export function Title(props: { children: string }): null {
  const headManager = useContext(HeadContext);
  if (!headManager) return null;

  headManager.add({ tag: "title", attrs: {}, children: props.children });
  return null;
}

/** Shortcut for pushing a `<meta>` entry into the document head. */
export function Meta(props: Record<string, string>): null {
  const headManager = useContext(HeadContext);
  if (!headManager) return null;

  headManager.add({ tag: "meta", attrs: props });
  return null;
}
