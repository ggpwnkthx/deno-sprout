/**
 * Async streaming support for JSX rendering.
 *
 * This module provides utilities for rendering JSX to a readable byte stream
 * and for converting the output to a plain string. It also re-exports the
 * `Suspense` boundary component from Hono.
 */
export { Suspense } from "@hono/hono/jsx/streaming";

import { renderToReadableStream as honoRenderToReadableStream } from "@hono/hono/jsx/streaming";
import type { HtmlEscapedString } from "@hono/hono/utils/html";

/**
 * Returns `true` if `component` is a value that can be passed to
 * {@link renderToReadableStream} or {@link renderToString}.
 *
 * Accepts plain strings, functions (JSX components), and Hono
 * `HtmlEscapedString` objects.
 */
function isRenderable(component: unknown): boolean {
  return (
    typeof component === "string" ||
    typeof component === "function" ||
    (component !== null &&
      typeof component === "object" &&
      "isEscaped" in component)
  );
}

/**
 * Renders a JSX component to a byte stream.
 *
 * This function is a thin wrapper around Hono's {@link renderToReadableStream}.
 * It accepts the same component types and validates the input with the same
 * logic as {@link renderToString}, throwing a descriptive {@link TypeError}
 * for unrecognized inputs before delegating to Hono.
 *
 * @param component - A JSX component, a plain string (treated as pre-escaped
 *   HTML), or an existing Hono `HtmlEscapedString`.
 * @returns A {@link ReadableStream} yielding UTF-8 HTML bytes.
 *
 * @throws {TypeError} If `component` is `null`, `undefined`, or any other
 *   value that cannot be rendered by Hono.
 *
 * @example
 * ```ts
 * const stream = await renderToReadableStream(<MyComponent />);
 * // pipe, consume, etc.
 * ```
 */
export function renderToReadableStream(
  component: unknown,
): ReadableStream<Uint8Array> {
  if (!isRenderable(component)) {
    throw new TypeError(
      `renderToReadableStream: expected a string or JSX component, received ${
        component === null ? "null" : typeof component
      }`,
    );
  }
  return honoRenderToReadableStream(
    component as Parameters<typeof honoRenderToReadableStream>[0],
  );
}

/**
 * Renders a JSX component to a plain HTML string by consuming the byte stream.
 *
 * This function converts the async {@link renderToReadableStream} output into a
 * single string. **This is a fully buffering operation** — the entire HTML
 * output is accumulated in memory before the promise resolves. For large
 * component trees this can consume significant heap. If incremental streaming
 * is required, use {@link renderToReadableStream} directly instead.
 *
 * Plain strings are returned directly without any rendering pipeline, since
 * they are already valid HTML. JSX components and Hono `HtmlEscapedString`
 * values are routed through the streaming pipeline.
 *
 * @param component - A JSX component, a plain string (treated as pre-escaped
 *   HTML), or an existing Hono `HtmlEscapedString`.
 * @returns A promise that resolves to the rendered HTML as a UTF-8 string.
 *
 * @throws {TypeError} If `component` is `null`, `undefined`, or any other
 *   value that cannot be rendered by Hono.
 *
 * @example
 * ```ts
 * const html = await renderToString(<MyComponent />);
 * console.log(html); // "<div>Hello</div>"
 * ```
 *
 * @example
 * ```ts
 * // Strings are returned as-is (treated as raw HTML)
 * const html = await renderToString("<strong>bold</strong>");
 * console.log(html); // "<strong>bold</strong>"
 * ```
 */
export async function renderToString(
  component: unknown,
): Promise<string> {
  // Fast path: plain strings are already valid HTML — return directly.
  if (typeof component === "string") {
    return component;
  }

  if (!isRenderable(component)) {
    throw new TypeError(
      `renderToString: expected a string or JSX component, received ${
        component === null ? "null" : typeof component
      }`,
    );
  }

  let renderable: string | HtmlEscapedString;
  if ("isEscaped" in (component as object)) {
    // Already a Hono HtmlEscapedString — pass through directly.
    renderable = component as HtmlEscapedString;
  } else {
    // Functions are accepted as renderable JSX components by Hono.
    renderable = component as unknown as HtmlEscapedString;
  }
  const stream = honoRenderToReadableStream(
    renderable as Parameters<typeof honoRenderToReadableStream>[0],
  );
  const reader = stream.getReader();
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Use stream mode for all chunks except the last to avoid corrupting
      // multi-byte UTF-8 sequences that span chunk boundaries.
      chunks.push(decoder.decode(value, { stream: true }));
    }
    // Flush any remaining buffered bytes in the decoder.
    chunks.push(decoder.decode());
  } finally {
    // Cancel the stream to abort any in-flight upstream work, then release
    // the reader lock so the stream can be garbage collected.
    reader.cancel().catch(() => {
      /* ignore — cancel rejects if the stream already closed normally */
    });
    reader.releaseLock();
  }
  return chunks.join("");
}
