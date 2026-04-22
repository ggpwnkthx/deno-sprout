// hmr/broadcast.ts - broadcast to clients and disconnect handling
import { assertEquals } from "@std/assert";
import { createHmrHandler } from "../../hmr.ts";

Deno.test("broadcast with no clients does nothing without throwing", () => {
  const clientSet = new Set<{ send(msg: string): void; close(): void }>();
  const { broadcast } = createHmrHandler({ clients: clientSet });

  let broadcastThrew = false;
  try {
    broadcast({ type: "css-update", path: "/path/to/style.css" });
  } catch {
    broadcastThrew = true;
  }

  assertEquals(broadcastThrew, false);
});

Deno.test("broadcast delivers to multiple clients", () => {
  const clientSet = new Set<{ send(msg: string): void; close(): void }>();
  const { broadcast } = createHmrHandler({ clients: clientSet });

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

  clientSet.add(client1);
  clientSet.add(client2);

  broadcast({ type: "island-update", path: "/path/to/islands/Counter.tsx" });

  assertEquals(received1.length, 1);
  assertEquals(received2.length, 1);
  const parsed1 = JSON.parse(received1[0]);
  const parsed2 = JSON.parse(received2[0]);
  assertEquals(parsed1.type, "island-update");
  assertEquals(parsed2.type, "island-update");
  assertEquals(parsed1.path, "/path/to/islands/Counter.tsx");
});

Deno.test("broadcast removes disconnected clients gracefully without rethrowing", () => {
  const clientSet = new Set<{ send(msg: string): void; close(): void }>();
  const { broadcast } = createHmrHandler({ clients: clientSet });

  const disconnectedClient = {
    send: (_msg: string) => {
      throw new Error("Client disconnected");
    },
    close: () => {},
  };

  clientSet.add(disconnectedClient);

  let broadcastThrew = false;
  try {
    broadcast({ type: "reload", path: "/path/to/routes/index.tsx" });
  } catch {
    broadcastThrew = true;
  }

  assertEquals(broadcastThrew, false);
});
