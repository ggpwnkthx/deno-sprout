// streaming.ts - Async streaming support
export { renderToReadableStream, Suspense } from "@hono/hono/jsx/streaming";

import { raw } from "@hono/hono/html";
import { renderToReadableStream as honoRenderToString } from "@hono/hono/jsx/streaming";

export async function renderToString(
  component: unknown,
): Promise<string> {
  // Convert strings to HtmlEscapedString via raw()
  const renderable = typeof component === "string"
    ? raw(component)
    : component as string & { isEscaped?: true; callbacks?: unknown[] };
  const reader = await honoRenderToString(
    renderable as Parameters<typeof honoRenderToString>[0],
  )
    .getReader();
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks.join("");
}
