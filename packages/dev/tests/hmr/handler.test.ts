// hmr/handler.ts - createHmrHandler return shape
import { assertEquals } from "@std/assert";
import { clearClients, createHmrHandler } from "../../hmr.ts";

Deno.test("createHmrHandler returns handler and broadcast function", () => {
  const { handler, broadcast } = createHmrHandler();

  assertEquals(typeof handler, "function");
  assertEquals(typeof broadcast, "function");
});

Deno.test("createHmrHandler handler initiates WebSocket upgrade without throwing", () => {
  const { handler } = createHmrHandler();

  const mockClient = {
    send: (_msg: string) => {},
    close: () => {},
  };

  try {
    let threw = false;
    let result: unknown;
    try {
      // deno-lint-ignore no-explicit-any
      result = handler({} as any, mockClient as any);
    } catch (_e) {
      threw = true;
    }
    assertEquals(threw, false);
    assertEquals(typeof result, "object");
  } finally {
    clearClients();
  }
});
