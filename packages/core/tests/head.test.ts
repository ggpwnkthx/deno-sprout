import { assertEquals, assertExists } from "@std/assert";
import {
  createHeadManager,
  Head,
  Meta,
  Title,
} from "@ggpwnkthx/sprout-core/lib/head";

Deno.test("createHeadManager returns manager with add method", () => {
  const manager = createHeadManager();
  assertExists(manager.add);
  assertEquals(manager.entries.length, 0);
});

Deno.test("createHeadManager add method appends entries", () => {
  const manager = createHeadManager();
  manager.add({ tag: "title", attrs: {}, children: "Test" });
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "title");
  assertEquals(manager.entries[0].children, "Test");
});

Deno.test("createHeadManager accepts meta entries", () => {
  const manager = createHeadManager();
  manager.add({ tag: "meta", attrs: { name: "description", content: "test" } });
  assertEquals(manager.entries.length, 1);
  assertEquals(manager.entries[0].tag, "meta");
  assertEquals(manager.entries[0].attrs.name, "description");
  assertEquals(manager.entries[0].attrs.content, "test");
});

Deno.test("Head component returns null when no context", () => {
  const result = Head({ children: [] });
  assertEquals(result, null);
});

Deno.test("Title component returns null when no context", () => {
  const result = Title({ children: "Test Title" });
  assertEquals(result, null);
});

Deno.test("Meta component returns null when no context", () => {
  const result = Meta({ name: "description", content: "test" });
  assertEquals(result, null);
});
