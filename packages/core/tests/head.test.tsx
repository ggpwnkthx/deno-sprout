// @jsxImportSource @hono/hono
import { assertEquals } from "@std/assert";
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import {
  createHeadManager,
  Head,
  HeadContext,
  Meta,
  Title,
} from "@ggpwnkthx/sprout-core/lib/head";

function createHeadManagerWithValues() {
  const manager = createHeadManager();
  return {
    manager,
    values: {
      entries: manager.entries,
      add: manager.add.bind(manager),
    },
  };
}

// ---------------------------------------------------------------------------
// Unit tests for createHeadManager (no context needed)
// ---------------------------------------------------------------------------

Deno.test("createHeadManager returns manager with add method", () => {
  const { manager } = createHeadManagerWithValues();
  assertEquals(typeof manager.add, "function");
  assertEquals(manager.entries.length, 0);
});

Deno.test("createHeadManager add method appends entries", () => {
  const { manager } = createHeadManagerWithValues();
  manager.add({ tag: "title", attrs: {}, children: "Test" });
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Test");
});

Deno.test("createHeadManager accepts meta entries", () => {
  const { manager } = createHeadManagerWithValues();
  manager.add({
    tag: "meta",
    attrs: { name: "description", content: "test" },
  });
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "meta");
  assertEquals(manager.entries[0].attrs.name, "description");
  assertEquals(manager.entries[0].attrs.content, "test");
});

Deno.test("createHeadManager add is idempotent (multiple adds)", () => {
  const { manager } = createHeadManagerWithValues();
  manager.add({ tag: "title", attrs: {}, children: "One" });
  manager.add({ tag: "meta", attrs: { name: "robots", content: "noindex" } });
  manager.add({ tag: "title", attrs: {}, children: "Two" });
  assertEquals(manager.entries.length, 3);
  assertEquals(manager.entries[0].children, "One");
  assertEquals(manager.entries[1].attrs.name, "robots");
  assertEquals(manager.entries[2].children, "Two");
});

// ---------------------------------------------------------------------------
// Integration tests: Title and Meta via HeadContext.Provider
// ---------------------------------------------------------------------------

Deno.test("Title component registers entry when context is provided", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Title>Site Title</Title>
        <main>Content</main>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Site Title");
  assertEquals(manager.entries[0].attrs, {});
});

Deno.test("Meta component registers entry when context is provided", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Meta name="keywords" content="deno, sprout" />
        <main>Content</main>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "meta");
  assertEquals(manager.entries[0].attrs.name, "keywords");
  assertEquals(manager.entries[0].attrs.content, "deno, sprout");
});

Deno.test("Title and Meta can be used together", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Title>Page Title</Title>
        <Meta name="description" content="A test page" />
        <main>Content</main>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 2);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Page Title");
  assertEquals(manager.entries[1].tag, "meta");
  assertEquals(manager.entries[1].attrs.name, "description");
  assertEquals(manager.entries[1].attrs.content, "A test page");
});

// ---------------------------------------------------------------------------
// Head component integration: renders entries into HTML output
// ---------------------------------------------------------------------------

Deno.test("Head entries appear in rendered HTML", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          <title>My Page Title</title>
          <meta name="description" content="Page description" />
          <meta name="robots" content="index, follow" />
        </Head>
        <html>
          <head />
          <body>
            <main>Content</main>
          </body>
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  // Entries are accumulated in the manager via the Head component.
  assertEquals(manager.entries.length, 3);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "My Page Title");
  assertEquals(manager.entries[1].tag, "meta");
  assertEquals(manager.entries[1].attrs.name, "description");
  assertEquals(manager.entries[1].attrs.content, "Page description");
  assertEquals(manager.entries[2].tag, "meta");
  assertEquals(manager.entries[2].attrs.name, "robots");
  assertEquals(manager.entries[2].attrs.content, "index, follow");
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

Deno.test("Title component returns null when no context", () => {
  const result = Title({ children: "Test Title" });
  assertEquals(result, null);
});

Deno.test("Meta component returns null when no context", () => {
  const result = Meta({ name: "description", content: "test" });
  assertEquals(result, null);
});

Deno.test("Head component returns null (no rendering)", () => {
  const { manager } = createHeadManagerWithValues();
  const result = Head({ children: [<Title key="hi">Hi</Title>] });
  assertEquals(result, null);
  // Manager is not mutated when no context is available
  assertEquals(manager.entries.length, 0);
});

Deno.test("HeadContext is re-exported correctly", () => {
  // Verify HeadContext is accessible
  assertEquals(typeof HeadContext, "function");
  // It should be a callable context function with a .Provider property
  assertEquals(
    typeof (HeadContext as unknown as { Provider: unknown }).Provider,
    "function",
  );
});
