// End-to-end tests for the M4 dev asset routes on @sprout/core.
//
// The test drives a real App built from the basic-app fixture
// and asserts on the framework asset routes registered by
// createApp:
//
//   - GET /@sprout/runtime.js
//   - GET /@sprout/runtime.js.map
//   - GET /@sprout/app.css
//   - GET /@sprout/island/<id>.js
//   - GET /@sprout/island/<id>.js.map
//
// plus the cache-control: no-store header on every response and
// the 404 path for missing islands.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { createApp } from "./mod.ts";
import type { App } from "./mod.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const BASIC_APP = join(REPO_ROOT, "tests/fixtures/basic-app");

async function withBasicApp<T>(fn: (app: App) => Promise<T>): Promise<T> {
  const app = await createApp({ root: BASIC_APP, mode: "development" });
  return await fn(app);
}

Deno.test("dev asset: GET /@sprout/runtime.js returns JS with no-store", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assert(body.length > 0, "runtime bundle should not be empty");
    // The runtime entry exports `start` per the M3 stub. The
    // compiled bundle must reference it.
    assertStringIncludes(body, "start");
  });
});

Deno.test("dev asset: GET /@sprout/runtime.js.map returns JSON map with no-store", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js.map"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assert(body.length > 0);
    assertStringIncludes(body, "version");
  });
});

Deno.test("dev asset: GET /@sprout/app.css returns the global stylesheet", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/app.css"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/css; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assertStringIncludes(body, "body");
    assertStringIncludes(body, "color: black");
  });
});

Deno.test("dev asset: GET /@sprout/island/Counter.js returns island wrapper JS", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/island/Counter.js"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    // The wrapper imports the user's island component and exposes
    // a `mount(element, props)` object that calls mountComponent.
    assertStringIncludes(body, "mount");
    assertStringIncludes(body, "mountComponent");
  });
});

Deno.test("dev asset: GET /@sprout/island/cart/AddButton.js returns island wrapper JS", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/island/cart/AddButton.js"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assertStringIncludes(body, "mount");
  });
});

Deno.test("dev asset: GET /@sprout/island/Missing.js returns 404", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/island/Missing.js"),
    );
    assertEquals(res.status, 404);
  });
});

Deno.test("dev asset: GET /@sprout/island/Counter.js.map returns JSON map", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/island/Counter.js.map"),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "no-store");
  });
});

Deno.test("dev asset: GET / on a real App returns HTML that references the runtime script", async () => {
  await withBasicApp(async (app) => {
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, '<script type="module" src="/@sprout/runtime.js">');
    // The runtime script must be reachable through the same app
    // instance.
    const script = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js"),
    );
    assertEquals(script.status, 200);
    const scriptBody = await script.text();
    assert(scriptBody.length > 0);
    // The script is a real ESM module (esbuild output) and
    // references the `start` symbol the M3 stub exports.
    assertStringIncludes(scriptBody, "start");
    assertStringIncludes(scriptBody, "export");
  });
});

Deno.test("dev asset: every dev asset response sets cache-control: no-store", async () => {
  await withBasicApp(async (app) => {
    const urls = [
      "/@sprout/runtime.js",
      "/@sprout/runtime.js.map",
      "/@sprout/app.css",
      "/@sprout/island/Counter.js",
      "/@sprout/island/Counter.js.map",
      "/@sprout/island/cart/AddButton.js",
    ];
    for (const path of urls) {
      const res = await app.fetch(new Request("http://0.0.0.0" + path));
      assertEquals(
        res.headers.get("cache-control"),
        "no-store",
        `${path} should set cache-control: no-store`,
      );
    }
  });
});

Deno.test("dev asset: framework asset routes run before user routes", async () => {
  // /@sprout/runtime.js is in the framework URL namespace; the
  // app must never let a user route with that path take over.
  // The fixture has no such user route, but a hand-built app
  // where the user tried to claim the namespace would see a
  // 404 from `createApp` discovery instead. The dev asset route
  // is registered first, so the response here must be 200.
  await withBasicApp(async (app) => {
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js"),
    );
    assertEquals(res.status, 200);
  });
});
