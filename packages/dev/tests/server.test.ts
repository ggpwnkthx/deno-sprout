import { assertEquals } from "@std/assert";
import { createDevServer } from "../server.ts";

async function createServerAndClose(root: string) {
  const app = await createDevServer({ root });
  // Close the HMR watcher to prevent resource leaks
  const watcher = (app as unknown as { _hmrWatcher?: { close: () => void } })
    ._hmrWatcher;
  if (watcher) {
    watcher.close();
  }
  return app;
}

Deno.test("createDevServer returns an App instance", async () => {
  const app = await createServerAndClose("./tests/fixtures");
  assertEquals(typeof app, "object");
  assertEquals(typeof app.fetch, "function");
});

Deno.test("createDevServer with full fixture responds 200 on /", async () => {
  const app = await createServerAndClose("./tests/fixtures");
  const res = await app.request("/");
  assertEquals(res.status, 200);
});

Deno.test("createDevServer handles missing route with 404", async () => {
  const app = await createServerAndClose("./tests/fixtures");
  const res = await app.request("/nonexistent");
  assertEquals(res.status, 404);
});
