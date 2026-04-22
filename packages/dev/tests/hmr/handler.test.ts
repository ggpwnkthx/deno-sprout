// hmr/handler.ts - createHmrHandler return shape
import { assertEquals } from "@std/assert";
import { createHmrHandler } from "../../hmr.ts";

Deno.test("createHmrHandler returns handler and broadcast function", () => {
  const { handler, broadcast } = createHmrHandler();

  assertEquals(typeof handler, "function");
  assertEquals(typeof broadcast, "function");
});

Deno.test("createHmrHandler handler is a callable function", () => {
  const { handler } = createHmrHandler();

  // The handler is a function (upgradeWebSocket returns middleware).
  // We do not call it here because upgradeWebSocket requires a full Hono
  // context with req.header() and a valid raw Request to avoid unhandled
  // promise rejections. The full WS upgrade lifecycle is tested via
  // app.request() with proper WS upgrade headers in routes.test.ts.
  assertEquals(typeof handler, "function");
});
