// streaming.ts - Async streaming support
export { renderToReadableStream, Suspense } from "@hono/hono/jsx/streaming";

import { raw } from "@hono/hono/html";

export async function renderToString(
  component: unknown,
): Promise<string> {
  const { renderToReadableStream: stream } = await import(
    "@hono/hono/jsx/streaming"
  );
  // Convert strings to HtmlEscapedString via raw()
  const renderable = typeof component === "string"
    ? raw(component)
    : component as string & { isEscaped?: true; callbacks?: unknown[] };
  const reader = await stream(renderable as Parameters<typeof stream>[0])
    .getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  return chunks.join("");
}
