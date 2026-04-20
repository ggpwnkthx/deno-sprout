import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/http-methods.test.tsx — POST/PUT/PATCH/DELETE, GET+POST coexist, handler() returning undefined
// ---------------------------------------------------------------------------

Deno.test("App.init() POST API route responds with 201", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/items.ts",
      `
      export const POST = (c) => c.json({ id: 42 }, 201);
      export default function Items() { return "<p>items</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/items", { method: "POST" });
    assertEquals(res.status, 201);
    assertEquals(await res.json(), { id: 42 });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() PUT API route responds correctly", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/items/[id].ts",
      `
      export const PUT = (c) => {
        const { id } = c.req.param();
        return c.json({ updated: id });
      };
      export default function Item() { return "<p>item</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/items/5", { method: "PUT" });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { updated: "5" });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() PATCH API route responds correctly", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/items/[id].ts",
      `
      export const PATCH = (c) => {
        const { id } = c.req.param();
        return c.json({ patched: id });
      };
      export default function Item() { return "<p>item</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/items/7", { method: "PATCH" });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { patched: "7" });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() DELETE API route responds correctly", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/items/[id].ts",
      `
      export const DELETE = (c) => {
        const { id } = c.req.param();
        return c.json({ deleted: id });
      };
      export default function Item() { return "<p>item</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/items/9", { method: "DELETE" });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { deleted: "9" });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() page route with GET and POST method handlers", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "form.tsx",
      `
      export const GET = (c) => c.text("GET form");
      export const POST = (c) => c.text("POST received", 200);
      export default function Form() { return "<p>form page</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const getRes = await app.request("/form", { method: "GET" });
    assertEquals(getRes.status, 200);
    assertEquals(await getRes.text(), "GET form");

    const postRes = await app.request("/form", { method: "POST" });
    assertEquals(postRes.status, 200);
    assertEquals(await postRes.text(), "POST received");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() handler() returning undefined falls through to page component", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/data.ts",
      `
      export const handler = () => undefined;
      export default function DataPage({ data }) {
        return "<p>data: " + (data === undefined ? "undefined" : data) + "</p>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/data");
    assertEquals(res.status, 200);
    const body = await res.text();
    // handler() returned undefined → page component renders with data=undefined
    assertStringIncludes(body, "data: undefined");
    assertStringIncludes(body, "<p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() API route with only GET handler (no default) responds correctly", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "api/ping.ts",
      `export const GET = (c) => c.text("pong");`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/api/ping");
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "pong");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
