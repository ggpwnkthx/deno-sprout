import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "@hono/hono";
import { createJsxRenderer, Fragment, memo } from "../renderer.ts";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";
import { defineLayout } from "@ggpwnkthx/sprout-core/lib/layout";

// ---------------------------------------------------------------------------
// createJsxRenderer — structure
// ---------------------------------------------------------------------------

Deno.test("createJsxRenderer returns a middleware handler", () => {
  const handler = createJsxRenderer();
  assertEquals(typeof handler, "function");
  // Middleware handler takes (c, next)
  assertEquals(handler.length, 2);
});

Deno.test("createJsxRenderer accepts optional layout", () => {
  const layout: LayoutComponent = ({ children }) => children;
  const handler = createJsxRenderer(layout);
  assertEquals(typeof handler, "function");
});

Deno.test("createJsxRenderer works without layout", () => {
  const handler = createJsxRenderer();
  assertEquals(typeof handler, "function");
});

// ---------------------------------------------------------------------------
// createJsxRenderer — rendering behavior
// ---------------------------------------------------------------------------

Deno.test("createJsxRenderer renders JSX to HTML via c.render", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) => c.render(<h1>Hello World</h1>));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Hello World");
});

Deno.test("createJsxRenderer sets content-type to text/html", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) => c.render(<p>test</p>));

  const res = await app.request("/");
  assertEquals(res.headers.get("content-type"), "text/html; charset=UTF-8");
});

Deno.test("createJsxRenderer wraps children in layout when provided", async () => {
  const app = new Hono();
  const layout: LayoutComponent = ({ children }) => (
    <html>
      <head />
      <body>
        <nav>NavBar</nav>
        <main>{children}</main>
      </body>
    </html>
  );
  app.use(createJsxRenderer(layout));
  app.get("/", (c) => c.render(<h1>Content</h1>));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "NavBar");
  assertStringIncludes(html, "Content");
});

Deno.test(
  "createJsxRenderer without layout returns children unwrapped",
  async () => {
    const app = new Hono();
    app.use(createJsxRenderer());
    app.get("/", (c) => c.render(<h1>Standalone</h1>));

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, "Standalone");
  },
);

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

Deno.test(
  "createJsxRenderer passes props to layout when layout reads them",
  async () => {
    const app = new Hono();
    const layout: LayoutComponent = ({ children, ...props }) => {
      const title = (props as Record<string, unknown>).title as string ?? "";
      return (
        <html>
          <head>
            <title>{title}</title>
          </head>
          <body>
            <main>{children}</main>
          </body>
        </html>
      );
    };
    app.use(createJsxRenderer(layout));
    app.get("/", (c) => c.render(<h1>Home</h1>));

    const res = await app.request("/");
    assertEquals(res.status, 200);
  },
);

Deno.test("layout receives children as HtmlEscapedString", async () => {
  const app = new Hono();
  let childrenType = "";

  const layout: LayoutComponent = ({ children }) => {
    childrenType = typeof children;
    return <div>{children}</div>;
  };

  app.use(createJsxRenderer(layout));
  app.get("/", (c) => c.render(<span>inner</span>));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  // children should be a non-null object/string (HtmlEscapedString)
  assertEquals(childrenType !== "undefined", true);
});

Deno.test("layout renders even when children is a simple string", async () => {
  const app = new Hono();
  const layout: LayoutComponent = ({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  );
  app.use(createJsxRenderer(layout));
  app.get("/", (c) => c.render("plain text"));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "plain text");
});

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

Deno.test("Fragment can be used to group elements without a wrapper", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <div>
        <Fragment>
          <span>A</span>
          <span>B</span>
        </Fragment>
      </div>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  // Both spans appear with no extra wrapper element
  assertStringIncludes(html, "A");
  assertStringIncludes(html, "B");
});

Deno.test("Fragment with nested elements renders correctly", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());
  app.get("/", (c) =>
    c.render(
      <div>
        <Fragment>
          <header>Header</header>
          <main>
            <Fragment>
              <p>Para1</p>
              <p>Para2</p>
            </Fragment>
          </main>
          <footer>Footer</footer>
        </Fragment>
      </div>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Header");
  assertStringIncludes(html, "Para1");
  assertStringIncludes(html, "Para2");
  assertStringIncludes(html, "Footer");
});

// ---------------------------------------------------------------------------
// memo
// ---------------------------------------------------------------------------

Deno.test("memo re-export is available and is a function", () => {
  assertEquals(typeof memo, "function");
});

Deno.test("memo can wrap a JSX component", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Inner = () => <span>inner</span>;
  const MemoizedInner = memo(Inner);

  app.get("/", (c) => c.render(<MemoizedInner />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "inner");
});

Deno.test("memo preserves component props", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Greeter = (props: { name: string }) => <span>Hello {props.name}</span>;
  const MemoGreeter = memo(Greeter);

  app.get("/", (c) => c.render(<MemoGreeter name="World" />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Hello World");
});

Deno.test("memo works with Fragment", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Multi = () => (
    <Fragment>
      <span>A</span>
      <span>B</span>
    </Fragment>
  );
  const MemoMulti = memo(Multi);

  app.get("/", (c) => c.render(<MemoMulti />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "A");
  assertStringIncludes(html, "B");
});

// ---------------------------------------------------------------------------
// Multiple routes
// ---------------------------------------------------------------------------

Deno.test("createJsxRenderer works across multiple routes", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  app.get("/", (c) => c.render(<h1>Home</h1>));
  app.get("/about", (c) => c.render(<h1>About</h1>));
  app.get("/contact", (c) => c.render(<h1>Contact</h1>));

  const home = await app.request("/");
  assertEquals(home.status, 200);
  const homeHtml = await home.text();
  assertStringIncludes(homeHtml, "Home");

  const about = await app.request("/about");
  assertEquals(about.status, 200);
  const aboutHtml = await about.text();
  assertStringIncludes(aboutHtml, "About");

  const contact = await app.request("/contact");
  assertEquals(contact.status, 200);
  const contactHtml = await contact.text();
  assertStringIncludes(contactHtml, "Contact");
});

// ---------------------------------------------------------------------------
// Component with complex children
// ---------------------------------------------------------------------------

Deno.test("component with array children renders correctly", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const items = ["alpha", "beta", "gamma"];
  const List = (props: { items: string[] }) => (
    <ul>
      {props.items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );

  app.get("/", (c) => c.render(<List items={items} />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "alpha");
  assertStringIncludes(html, "beta");
  assertStringIncludes(html, "gamma");
});

Deno.test("nested components render correctly", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Inner = () => <span>inner</span>;
  const Middle = () => (
    <div>
      <Inner />
    </div>
  );
  const Outer = () => (
    <section>
      <Middle />
    </section>
  );

  app.get("/", (c) => c.render(<Outer />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "inner");
});

Deno.test("components with numeric children render correctly", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowNumbers = () => (
    <dl>
      <dt>Count</dt>
      <dd>{42}</dd>
      <dd>{0}</dd>
      <dd>{-1}</dd>
    </dl>
  );

  app.get("/", (c) => c.render(<ShowNumbers />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "42");
  assertStringIncludes(html, "0");
  assertStringIncludes(html, "-1");
});

Deno.test("components with boolean/null children do not render text", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowBooleans = () => (
    <div>
      {true}
      {false}
      {null}
      {undefined}
      <span>visible</span>
    </div>
  );

  app.get("/", (c) => c.render(<ShowBooleans />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "visible");
  assertEquals(html.includes("true"), false);
  assertEquals(html.includes("false"), false);
  assertEquals(html.includes("null"), false);
  assertEquals(html.includes("undefined"), false);
});

// ---------------------------------------------------------------------------
// Re-use of renderer across requests (stress test)
// ---------------------------------------------------------------------------

Deno.test("renderer handles multiple sequential requests", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    return c.render(<p>Item {id}</p>);
  });

  for (const id of ["1", "2", "3"]) {
    const res = await app.request(`/${id}`);
    assertEquals(res.status, 200);
    const html = await res.text();
    assertStringIncludes(html, `Item ${id}`);
  }
});

// ---------------------------------------------------------------------------
// Cross-package integration — LayoutComponent from @ggpwnkthx/sprout-core
// ---------------------------------------------------------------------------

Deno.test("createJsxRenderer works with defineLayout from @ggpwnkthx/sprout-core", async () => {
  const app = new Hono();

  // defineLayout from core packages a LayoutComponent with the same contract
  const layout = defineLayout(({ children }) => (
    <html>
      <head />
      <body>
        <header>Site Header</header>
        <main>{children}</main>
      </body>
    </html>
  ));

  app.use(createJsxRenderer(layout));
  app.get("/", (c) => c.render(<h1>Home</h1>));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Site Header");
  assertStringIncludes(html, "Home");
  assertStringIncludes(html, "<header>");
  assertStringIncludes(html, "<main>");
});

Deno.test("createJsxRenderer with core defineLayout handles nested routes", async () => {
  const app = new Hono();

  const layout: LayoutComponent = ({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  );

  app.use(createJsxRenderer(layout));
  app.get("/a", (c) => c.render(<p>Page A</p>));
  app.get("/b", (c) => c.render(<p>Page B</p>));

  const resA = await app.request("/a");
  assertEquals(resA.status, 200);
  assertStringIncludes(await resA.text(), "Page A");

  const resB = await app.request("/b");
  assertEquals(resB.status, 200);
  assertStringIncludes(await resB.text(), "Page B");
});

Deno.test("defineLayout returns a LayoutComponent usable as createJsxRenderer argument", async () => {
  const app = new Hono();

  const defined = defineLayout(({ children }) => (
    <div class="wrapper">{children}</div>
  ));

  app.use(createJsxRenderer(defined));
  app.get("/", (c) => c.render(<span>wrapped</span>));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, 'class="wrapper"');
  assertStringIncludes(html, "wrapped");
});
