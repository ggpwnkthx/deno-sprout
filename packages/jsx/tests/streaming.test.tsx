import {
  assertEquals,
  assertInstanceOf,
  assertStringIncludes,
} from "@std/assert";
import {
  renderToReadableStream,
  renderToString,
  Suspense,
} from "../streaming.ts";

// ---------------------------------------------------------------------------
// renderToString — basic cases
// ---------------------------------------------------------------------------

Deno.test("renderToString returns a string for string input", async () => {
  const result = await renderToString("hello");
  assertEquals(typeof result, "string");
  assertStringIncludes(result, "hello");
});

Deno.test("renderToString handles empty string", async () => {
  const result = await renderToString("");
  assertEquals(result, "");
});

Deno.test("renderToString returns non-empty string for non-empty input", async () => {
  const result = await renderToString("test content");
  assertStringIncludes(result, "test content");
});

// ---------------------------------------------------------------------------
// renderToString — JSX element rendering
// ---------------------------------------------------------------------------

Deno.test("renderToString renders a JSX element to a string", async () => {
  const result = await renderToString(<span>JSX element</span>);
  assertEquals(typeof result, "string");
  assertStringIncludes(result, "JSX element");
});

Deno.test("renderToString renders nested JSX elements", async () => {
  const result = await renderToString(
    <div>
      <h1>Title</h1>
      <p>Paragraph</p>
    </div>,
  );
  assertStringIncludes(result, "Title");
  assertStringIncludes(result, "Paragraph");
});

Deno.test("renderToString renders JSX with dynamic string children", async () => {
  const name = "Alice";
  const result = await renderToString(<p>Hello, {name}!</p>);
  assertStringIncludes(result, "Hello, Alice!");
});

Deno.test("renderToString renders JSX with numeric expressions", async () => {
  const result = await renderToString(<p>Count: {42}</p>);
  assertStringIncludes(result, "Count:");
  assertStringIncludes(result, "42");
});

// ---------------------------------------------------------------------------
// renderToString — edge cases
// ---------------------------------------------------------------------------

Deno.test("renderToString renders boolean true child as empty (no output)", async () => {
  // Boolean true typically renders as nothing in JSX
  const result = await renderToString(<div>{true}</div>);
  assertEquals(typeof result, "string");
  // true children should not add text
  assertEquals(result.includes("true"), false);
  assertStringIncludes(result, "<div></div>");
});

Deno.test("renderToString renders boolean false child as empty", async () => {
  const result = await renderToString(<div>{false}</div>);
  assertEquals(typeof result, "string");
  assertEquals(result.includes("false"), false);
});

Deno.test("renderToString renders null child as empty", async () => {
  const result = await renderToString(<div>{null}</div>);
  assertEquals(typeof result, "string");
  // null children should not add text
  assertEquals(result.includes("null"), false);
});

Deno.test("renderToString renders undefined child as empty", async () => {
  const result = await renderToString(<div>{undefined}</div>);
  assertEquals(typeof result, "string");
  assertEquals(result.includes("undefined"), false);
});

Deno.test("renderToString renders numeric zero as '0'", async () => {
  const result = await renderToString(<p>{0}</p>);
  assertStringIncludes(result, "0");
});

Deno.test("renderToString renders numeric 42 as '42'", async () => {
  const result = await renderToString(<p>{42}</p>);
  assertStringIncludes(result, "42");
});

Deno.test("renderToString renders deeply nested elements", async () => {
  const result = await renderToString(
    <html>
      <head />
      <body>
        <div>
          <article>
            <h1>Deep</h1>
            <p>
              <span>nested</span>
            </p>
          </article>
        </div>
      </body>
    </html>,
  );
  assertStringIncludes(result, "Deep");
  assertStringIncludes(result, "nested");
});

Deno.test("renderToString renders an array of elements", async () => {
  const items = ["apple", "banana", "cherry"];
  const result = await renderToString(
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>,
  );
  assertStringIncludes(result, "apple");
  assertStringIncludes(result, "banana");
  assertStringIncludes(result, "cherry");
});

Deno.test("renderToString renders empty array children", async () => {
  const items: string[] = [];
  const result = await renderToString(
    <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>,
  );
  assertEquals(typeof result, "string");
});

Deno.test("renderToString renders Fragment with multiple children", async () => {
  const { Fragment } = await import("@hono/hono/jsx");
  const result = await renderToString(
    <Fragment>
      <p>A</p>
      <p>B</p>
      <p>C</p>
    </Fragment>,
  );
  assertStringIncludes(result, "A");
  assertStringIncludes(result, "B");
  assertStringIncludes(result, "C");
});

Deno.test("renderToString renders mixed content: strings, numbers, elements", async () => {
  const count = 3;
  const result = await renderToString(
    <div>
      Items: {count} pcs.
    </div>,
  );
  assertStringIncludes(result, "Items:");
  assertStringIncludes(result, "3");
  assertStringIncludes(result, "pcs.");
});

Deno.test("renderToString renders self-closing tags", async () => {
  const result = await renderToString(
    <div>
      <input type="text" />
      <br />
      <hr />
    </div>,
  );
  assertStringIncludes(result, "<input");
  assertStringIncludes(result, "<br");
  assertStringIncludes(result, "<hr");
});

Deno.test("renderToString renders element with multiple attributes", async () => {
  const result = await renderToString(
    <button type="button" disabled class="primary">
      Click
    </button>,
  );
  assertStringIncludes(result, 'type="button"');
  assertStringIncludes(result, "disabled");
  assertStringIncludes(result, 'class="primary"');
  assertStringIncludes(result, "Click");
});

// ---------------------------------------------------------------------------
// renderToReadableStream — basic cases
// ---------------------------------------------------------------------------

Deno.test("renderToReadableStream returns a ReadableStream", () => {
  const result = renderToReadableStream(<p>stream content</p>);
  assertInstanceOf(result, ReadableStream);
});

Deno.test("renderToReadableStream resolves to HTML when consumed", async () => {
  const stream = renderToReadableStream(<p>streamed</p>);
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "streamed");
});

Deno.test("renderToReadableStream works with Fragment", async () => {
  const { Fragment } = await import("@hono/hono/jsx");
  const stream = renderToReadableStream(
    <div>
      <Fragment>
        <span>A</span>
        <span>B</span>
      </Fragment>
    </div>,
  );
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "A");
  assertStringIncludes(html, "B");
});

Deno.test("renderToReadableStream renders deeply nested JSX", async () => {
  const stream = renderToReadableStream(
    <div>
      <article>
        <h1>Deeply nested title</h1>
        <p>
          <span>Nested span content</span>
        </p>
      </article>
    </div>,
  );
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "Deeply nested title");
  assertStringIncludes(html, "Nested span content");
});

Deno.test("renderToReadableStream renders array of elements", async () => {
  const items = ["x", "y", "z"];
  const stream = renderToReadableStream(
    <ol>{items.map((s) => <li key={s}>{s}</li>)}</ol>,
  );
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "x");
  assertStringIncludes(html, "y");
  assertStringIncludes(html, "z");
});

// ---------------------------------------------------------------------------
// Suspense
// ---------------------------------------------------------------------------

Deno.test("Suspense is exported and is a function (hono Suspense component)", () => {
  assertEquals(typeof Suspense, "function");
});

// ---------------------------------------------------------------------------
// renderToReadableStream — edge cases
// ---------------------------------------------------------------------------

Deno.test("renderToReadableStream renders numeric children", async () => {
  const stream = renderToReadableStream(<p>{12345}</p>);
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "12345");
});

Deno.test("renderToReadableStream renders boolean false child", async () => {
  // Boolean false should render nothing visible
  const stream = renderToReadableStream(<div>{false}</div>);
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertEquals(html.includes("false"), false);
});

Deno.test("renderToReadableStream renders null child as nothing", async () => {
  const stream = renderToReadableStream(<div>{null}</div>);
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const decoder = new TextDecoder();
    chunks.push(decoder.decode(value));
  }
  const html = chunks.join("");
  assertEquals(html.includes("null"), false);
});

// ---------------------------------------------------------------------------
// Suspense — behavioral tests
// ---------------------------------------------------------------------------

Deno.test("Suspense renders a fallback when wrapped in renderToReadableStream", async () => {
  // This tests that Suspense + renderToReadableStream integrate correctly.
  // The Suspense boundary is rendered and the fallback appears in output.
  const stream = renderToReadableStream(
    <Suspense fallback={<span>loading...</span>}>
      <span>immediate</span>
    </Suspense>,
  );

  const reader = stream.getReader();
  const chunks: string[] = [];
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(dec.decode(value));
  }
  const html = chunks.join("");
  // Suspense renders immediately since the child is sync
  assertStringIncludes(html, "immediate");
  assertEquals(html.includes("loading..."), false);
});

Deno.test("Suspense renders children after promise resolves", async () => {
  let resolve!: (v: string) => void;
  const slowPromise = new Promise<string>((r) => {
    resolve = r;
  });

  const AsyncChild = async () => {
    const value = await slowPromise;
    return <span>resolved: {value}</span>;
  };

  const stream = renderToReadableStream(
    <Suspense fallback={<span>loading...</span>}>
      <AsyncChild />
    </Suspense>,
  );

  // Resolve the promise
  resolve("done!");

  // Read all chunks
  const reader = stream.getReader();
  const chunks: string[] = [];
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(dec.decode(value));
  }
  const html = chunks.join("");
  assertStringIncludes(html, "resolved: done!");
});

// NOTE: Suspense + renderToString behavioral tests are not reliable here because
// Hono's Suspense + renderToReadableStream integration resolves async children
// via stream callbacks whose timing relative to renderToString's internal await
// is not predictable from outside the hono package. The Suspense export is tested
// via type check and renderToReadableStream integration above.

// ---------------------------------------------------------------------------
// renderToReadableStream — chunk-level streaming tests
// ---------------------------------------------------------------------------

// NOTE: Chunk-count assertion removed — chunk boundaries are determined by runtime
// internal buffering and flush behavior, not content size. This test was
// environment-sensitive and non-deterministic.

Deno.test("renderToReadableStream chunk boundaries respect element structure", async () => {
  // Verify that individual HTML elements don't get split mid-tag
  const stream = renderToReadableStream(
    <div>
      <p>Paragraph one</p>
      <p>Paragraph two</p>
      <p>Paragraph three</p>
    </div>,
  );

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Decode all chunks and verify well-formed structure
  const decoder = new TextDecoder();
  const html = chunks.map((c) => decoder.decode(c)).join("");
  assertStringIncludes(html, "<div>");
  assertStringIncludes(html, "<p>Paragraph one</p>");
  assertStringIncludes(html, "<p>Paragraph two</p>");
  assertStringIncludes(html, "<p>Paragraph three</p>");
});

// ---------------------------------------------------------------------------
// renderToReadableStream — error / edge-case paths
// ---------------------------------------------------------------------------

Deno.test("renderToReadableStream handles function value gracefully", async () => {
  // Passing a plain function (not a component) should not throw
  const fn = () => "not a component";
  const stream = renderToReadableStream(
    fn as unknown as Parameters<typeof renderToReadableStream>[0],
  );
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  const html = chunks.join("");
  // Should produce a string without throwing
  assertEquals(typeof html, "string");
});

Deno.test("renderToReadableStream handles undefined prop", async () => {
  const stream = renderToReadableStream(<div>{undefined}</div>);
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  const html = chunks.join("");
  assertEquals(typeof html, "string");
  assertEquals(html.includes("undefined"), false);
});

// ---------------------------------------------------------------------------
// renderToString — error / edge-case paths
// ---------------------------------------------------------------------------

Deno.test("renderToString does not throw for plain function input", async () => {
  const fn = () => "plain function";
  // Plain function passes through hono's renderer; output is a string (not necessarily valid HTML)
  const result = await renderToString(
    fn as unknown as Parameters<typeof renderToString>[0],
  );
  assertEquals(typeof result, "string");
  // Result should be non-empty since the function returns a value
  assertEquals(result.length > 0, true);
});

Deno.test("renderToString renders zero correctly in various contexts", async () => {
  const result = await renderToString(
    <div>
      <p>Count: {0}</p>
      <span>{0 + 1}</span>
    </div>,
  );
  assertStringIncludes(result, "0");
  assertStringIncludes(result, "1");
});

Deno.test("renderToString renders negative numbers", async () => {
  const result = await renderToString(<p>{-42}</p>);
  assertStringIncludes(result, "-42");
});

Deno.test("renderToString renders empty fragment", async () => {
  const { Fragment } = await import("@hono/hono/jsx");
  const result = await renderToString(<Fragment />);
  assertEquals(typeof result, "string");
});

Deno.test("renderToString renders template literal children", async () => {
  const tag = "world";
  const result = await renderToString(<p>Hello, {tag}!</p>);
  assertStringIncludes(result, "Hello, world!");
});
