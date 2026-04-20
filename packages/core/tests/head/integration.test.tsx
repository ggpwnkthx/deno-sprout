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

// ---------------------------------------------------------------------------
// toHeadEntry edge cases tested through Head component behavior
// ---------------------------------------------------------------------------

// Child is a non-HTML tag node (custom component) → not added to manager
Deno.test("Head custom component (not in HTML_TAG_NAMES) is not added to manager", async () => {
  const { values, manager } = createHeadManagerWithValues();

  // A custom component with capital-letter tag name
  const CustomComponent = ({ name }: { name: string }) => (
    <div>Custom: {name}</div>
  );

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          <CustomComponent name="test" />
          <Title>Page Title</Title>
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  // Only the valid HTML tag (Title) should be in entries
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Page Title");
});

// Child has no children (empty props.children) → HeadEntry has undefined children
Deno.test("Head title with no children has undefined children in entry", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          {/* title tag with no children */}
          <title></title>
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, undefined);
});

// Child has nested children (array) → only string children captured
Deno.test("Head meta with nested array children captures only string child", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          {/* meta tag with complex nested structure — children will be array */}
          <meta name="description" content="A test page" />
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "meta");
  assertEquals(manager.entries[0].attrs.name, "description");
  assertEquals(manager.entries[0].attrs.content, "A test page");
});

// Child tag name lowercased via toHeadEntry
Deno.test("Head lowercase title tag is stored as 'title' (lowercased) in entry", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          <title>Test Title</title>
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Test Title");
});

// Multiple head elements — all valid HTML tags added in order
Deno.test("Head multiple valid HTML tags are added in order", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          <title>Multi Title</title>
          <meta name="keywords" content="deno, sprout" />
          <meta name="author" content="sprout" />
          <link rel="stylesheet" href="/style.css" />
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 4);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Multi Title");
  assertEquals(manager.entries[1].tag, "meta");
  assertEquals(manager.entries[1].attrs.name, "keywords");
  assertEquals(manager.entries[1].attrs.content, "deno, sprout");
  assertEquals(manager.entries[2].tag, "meta");
  assertEquals(manager.entries[2].attrs.name, "author");
  assertEquals(manager.entries[2].attrs.content, "sprout");
  assertEquals(manager.entries[3].tag, "link");
  assertEquals(manager.entries[3].attrs.rel, "stylesheet");
  assertEquals(manager.entries[3].attrs.href, "/style.css");
});

// Mixed valid and invalid children — only valid HTML tags are added
Deno.test("Head mixed valid HTML tags and custom components adds only valid tags", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const CustomWidget = ({ id }: { id: string }) => <div id={id}>Widget</div>;

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>
          <CustomWidget id="w1" />
          <title>Title After Custom</title>
          <meta name="description" content="desc" />
          <CustomWidget id="w2" />
        </Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  // Only the two valid HTML tags should be in entries
  assertEquals(manager.entries.length, 2);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[1].tag, "meta");
});

// Empty children array → no entries added
Deno.test("Head with empty children array adds no entries", async () => {
  const { values, manager } = createHeadManagerWithValues();

  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <HeadContext.Provider value={values}>
        <Head>{[]}</Head>
        <html>
          <head />
          <body />
        </html>
      </HeadContext.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  assertEquals(manager.entries.length, 0);
});
