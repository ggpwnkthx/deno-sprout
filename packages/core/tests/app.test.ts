import { assertEquals } from "@std/assert";
import { createApp } from "../../sprout/mod.ts";

Deno.test("createApp returns an App instance", async () => {
  const app = await createApp({ root: "./tests/fixtures/smoke" });
  assertEquals(typeof app, "object");
  assertEquals(typeof app.fetch, "function");
});

Deno.test("createApp with minimal fixture responds 200 on /", async () => {
  const app = await createApp({ root: "./tests/fixtures/smoke" });
  const res = await app.request("/");
  assertEquals(res.status, 200);
});

Deno.test("createApp handles missing route with 404", async () => {
  const app = await createApp({ root: "./tests/fixtures/smoke" });
  const res = await app.request("/nonexistent");
  assertEquals(res.status, 404);
});
