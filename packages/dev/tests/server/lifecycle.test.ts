// server/lifecycle.ts - createDevServer lifecycle, static files, invalid root
import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { buildFixture, createServerAndClose } from "../helpers.ts";
import { createDevServer } from "../../server.ts";

Deno.test("createDevServer returns an App instance", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    assertEquals(typeof app, "object");
    assertEquals(typeof app.fetch, "function");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer with fixture responds 200 on /", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Hello from dev server");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer handles missing route with 404", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/nonexistent-page");
    assertEquals(res.status, 404);
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer serves static files from /static", async () => {
  const fixture = await buildFixture();
  const originalCwd = Deno.cwd();
  try {
    Deno.chdir(fixture.root);
    await Deno.writeTextFile(
      join(fixture.staticDir, "styles.css"),
      "body { color: red; }",
    );

    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/static/styles.css");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/css; charset=utf-8");
    const body = await res.text();
    assertStringIncludes(body, "color: red");
  } finally {
    Deno.chdir(originalCwd);
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer throws when root directory does not exist", async () => {
  let threw = false;
  try {
    await createDevServer({ root: "/nonexistent/root/dir" });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
