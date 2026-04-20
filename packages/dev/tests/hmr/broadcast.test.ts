// hmr/broadcast.ts - broadcast to clients and disconnect handling
import { assertEquals } from "@std/assert";
import { clearClients, createHmrHandler } from "../../hmr.ts";

Deno.test("broadcast delivers message to connected clients", () => {
  const { handler, broadcast } = createHmrHandler();

  const messages: string[] = [];
  const mockClient = {
    send: (msg: string) => messages.push(msg),
    close: () => {},
  };

  try {
    // deno-lint-ignore no-explicit-any
    handler({} as any, mockClient as any);

    broadcast({ type: "css-update", path: "/path/to/style.css" });

    assertEquals(messages.length, 1);
    const parsed = JSON.parse(messages[0]);
    assertEquals(parsed.type, "css-update");
    assertEquals(parsed.path, "/path/to/style.css");
  } finally {
    clearClients();
  }
});

Deno.test("broadcast delivers to multiple clients", () => {
  const { handler, broadcast } = createHmrHandler();

  const received1: string[] = [];
  const received2: string[] = [];
  const client1 = {
    send: (msg: string) => received1.push(msg),
    close: () => {},
  };
  const client2 = {
    send: (msg: string) => received2.push(msg),
    close: () => {},
  };

  try {
    // deno-lint-ignore no-explicit-any
    handler({} as any, client1 as any);
    // deno-lint-ignore no-explicit-any
    handler({} as any, client2 as any);

    broadcast({ type: "island-update", path: "/path/to/islands/Counter.tsx" });

    assertEquals(received1.length, 1);
    assertEquals(received2.length, 1);
    const parsed1 = JSON.parse(received1[0]);
    const parsed2 = JSON.parse(received2[0]);
    assertEquals(parsed1.type, "island-update");
    assertEquals(parsed2.type, "island-update");
    assertEquals(parsed1.path, "/path/to/islands/Counter.tsx");
  } finally {
    clearClients();
  }
});

Deno.test("broadcast removes disconnected clients gracefully without rethrowing", () => {
  const { handler, broadcast } = createHmrHandler();

  const disconnectedClient = {
    send: (_msg: string) => {
      throw new Error("Client disconnected");
    },
    close: () => {},
  };

  try {
    // deno-lint-ignore no-explicit-any
    handler({} as any, disconnectedClient as any);

    let broadcastThrew = false;
    try {
      broadcast({ type: "reload", path: "/path/to/routes/index.tsx" });
    } catch {
      broadcastThrew = true;
    }

    assertEquals(broadcastThrew, false);
  } finally {
    clearClients();
  }
});
