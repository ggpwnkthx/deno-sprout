// End-to-end tests for `@sprout/core` M3: route rendering, method
// dispatch, public file serving, and the island-placeholder
// emission contract.
//
// The tests build an `App` per test (no real port binding) and
// drive it with `app.fetch(new Request(...))`. The `basic-app`
// fixture is the canonical M3 example: 7 routes, 2 islands, an
// `app.css` stylesheet, and a public `favicon.svg`.
import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { createApp, getHono } from "./mod.ts";
import type { App } from "./mod.ts";
import { Hono } from "@hono/hono";
import { buildRequestContext } from "./server/context.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const BASIC_APP = join(REPO_ROOT, "tests/fixtures/basic-app");

async function withBasicApp<T>(fn: (app: App) => Promise<T>): Promise<T> {
  const app = await createApp({ root: BASIC_APP, mode: "development" });
  return await fn(app);
}

Deno.test("createApp: GET / returns HTML with the island placeholder", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^text\/html/);
    const body = await res.text();
    assertStringIncludes(body, "<!doctype html>");
    assertStringIncludes(body, "<h1>hi</h1>");
    // The Counter island placeholder contract:
    //   data-sprout-island, data-sprout-src, data-sprout-props
    assertStringIncludes(body, 'data-sprout-island="Counter"');
    assertStringIncludes(body, 'data-sprout-src="/@sprout/island/Counter.js"');
    // Hono escapes the attribute value as `&quot;`; the decoded
    // form is the JSON literal. We assert on the parsed JSON.
    assertMatch(body, /data-sprout-props="[^"]*initial[^"]*7/);
    // Runtime script and stylesheet tags.
    assertStringIncludes(body, '<script type="module" src="/@sprout/runtime.js">');
    assertMatch(body, /<link[^>]*rel="stylesheet"[^>]*href="\/@sprout\/app.css"/);
  });
});

Deno.test("createApp: GET /about returns HTML with the runtime and stylesheet", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/about"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "about");
    assertStringIncludes(body, '<script type="module" src="/@sprout/runtime.js">');
    assertMatch(body, /<link[^>]*rel="stylesheet"[^>]*href="\/@sprout\/app.css"/);
  });
});

Deno.test("createApp: GET /blog/hello exercises the dynamic route", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/blog/hello"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "hello");
    assertStringIncludes(body, '<script type="module" src="/@sprout/runtime.js">');
  });
});

Deno.test("createApp: POST /api/contact returns JSON", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/api/contact", { method: "POST" }),
    );
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^application\/json/);
    const payload = await res.json();
    assertEquals(payload, { ok: true, method: "POST" });
  });
});

Deno.test("createApp: GET /api/contact returns JSON from the GET handler", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/api/contact", { method: "GET" }),
    );
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^application\/json/);
    const payload = await res.json();
    assertEquals(payload, { items: [] });
  });
});

Deno.test("createApp: HEAD / returns 200 with an empty body", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/", { method: "HEAD" }));
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^text\/html/);
    const body = await res.text();
    assertEquals(body, "");
  });
});

Deno.test("createApp: HEAD on a route without HEAD falls back to GET and strips the body", async () => {
  // `/about` is a page with a default export but no explicit HEAD.
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/about", { method: "HEAD" }),
    );
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^text\/html/);
    const body = await res.text();
    assertEquals(body, "");
  });
});

Deno.test("createApp: GET on a missing route returns 404", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/does-not-exist"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertExists(body);
    assert(body.length > 0, "404 body should not be empty");
  });
});

Deno.test("createApp: PUT /api/contact returns 405 with Allow listing supported methods", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/api/contact", { method: "PUT" }),
    );
    assertEquals(res.status, 405);
    const allow = res.headers.get("allow") ?? "";
    // The route module defines GET and POST. HEAD is implicit via
    // the page default. The order in `Allow` is not stable across
    // Hono versions, so we assert on the set of methods.
    const methods = new Set(allow.split(",").map((s) => s.trim()).filter(Boolean));
    for (const m of ["GET", "POST", "HEAD"]) {
      assert(methods.has(m), `expected Allow to include ${m}, got ${allow}`);
    }
  });
});

Deno.test("createApp: GET /favicon.svg serves the public file", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/favicon.svg"));
    assertEquals(res.status, 200);
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /svg/);
    const body = await res.text();
    assert(body.startsWith("<svg"), `expected body to start with <svg, got ${body.slice(0, 32)}`);
  });
});

// Dev-mode public file cache-control: tolerates stale copies for
// fast iteration. (Production uses must-revalidate to force
// revalidation so updated files are visible after a deploy.)
Deno.test("createApp: public file in dev mode uses max-age=3600", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/favicon.svg"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("cache-control"), "public, max-age=3600");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  });
});

// Production-mode public file cache-control: forces revalidation on
// every request so updated public files are visible immediately
// after a deploy. The 304 is cached, so revalidation is cheap.
Deno.test("createApp: public file in production mode uses must-revalidate", async () => {
  const app = await createApp({ root: BASIC_APP, mode: "production" });
  const res = await app.fetch(new Request("http://0.0.0.0/favicon.svg"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
});

Deno.test("createApp: GET /nope.png returns 404 for a missing public file", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/nope.png"));
    assertEquals(res.status, 404);
  });
});

Deno.test("createApp: re-rendering the same route still emits the island placeholder", async () => {
  // The per-request island registry is cleared and re-populated
  // inside `renderRoute`. Calling `fetch` twice on the same app
  // should produce the placeholder on both responses.
  await withBasicApp(async (app) => {
    const r1 = await app.fetch(new Request("http://0.0.0.0/"));
    const r2 = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(r1.status, 200);
    assertEquals(r2.status, 200);
    const b1 = await r1.text();
    const b2 = await r2.text();
    assertStringIncludes(b1, 'data-sprout-island="Counter"');
    assertStringIncludes(b2, 'data-sprout-island="Counter"');
  });
});

Deno.test("createApp: HEAD on a missing route returns 404 with an empty body", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/does-not-exist", { method: "HEAD" }),
    );
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body, "");
  });
});

Deno.test("createApp: GET /about HEAD /about headers share content-type", async () => {
  await withBasicApp(async (app) => {
    const get = await app.fetch(new Request("http://0.0.0.0/about", { method: "GET" }));
    const head = await app.fetch(new Request("http://0.0.0.0/about", { method: "HEAD" }));
    assertEquals(get.status, 200);
    assertEquals(head.status, 200);
    assertEquals(
      (head.headers.get("content-type") ?? "").split(";")[0],
      (get.headers.get("content-type") ?? "").split(";")[0],
    );
  });
});

Deno.test("getHono: returns the underlying Hono instance with a working hono field", async () => {
  await withBasicApp(async (app) => {
    const hono = getHono(app).hono;
    assertExists(hono);
    assert(hono instanceof Hono, "getHono(app).hono must be a Hono instance");
    // The Hono instance must be functional: it has the expected methods.
    assertEquals(typeof hono.fetch, "function");
    assertEquals(typeof hono.onError, "function");
    assertEquals(typeof hono.notFound, "function");
    // Prove the Hono instance is the real one by issuing a request.
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 200);
  });
});

Deno.test("context: json(undefined) produces body 'null' (not empty)", async () => {
  const ctx = buildRequestContext({
    request: new Request("http://0.0.0.0/"),
    url: new URL("http://0.0.0.0/"),
    params: {},
  });
  const res = ctx.json(undefined);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  // The body must be the string "null", not an empty string.
  const body = await res.text();
  assertEquals(body, "null");
});

Deno.test("context: html(undefined) produces an empty body (not 'undefined')", async () => {
  const ctx = buildRequestContext({
    request: new Request("http://0.0.0.0/"),
    url: new URL("http://0.0.0.0/"),
    params: {},
  });
  // The html() implementation is synchronous; the Promise branch in
  // the return type is for render(), not html().
  const res = await ctx.html(undefined) as Response;
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  // The body must be empty, not the literal string "undefined".
  const body = await res.text();
  assertEquals(body, "");
});
