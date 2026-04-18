// mount_test.ts - Tests for mount function
/// <reference lib="dom" />
import { assertEquals } from "@std/assert";
import { mount } from "@ggpwnkthx/sprout-islands/lib/mount";
import type { FC } from "@hono/hono/jsx";

Deno.test("mount: sets innerHTML to rendered output", async () => {
  // Create a mock element
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const Component: FC<{ name: string }> = ({ name }) =>
    `<div>Hello ${name}</div>` as unknown as ReturnType<FC<{ name: string }>>;

  const dispose = await mount(Component, { name: "world" }, container);
  assertEquals(container.innerHTML, "<div>Hello world</div>");

  // dispose is currently a no-op
  dispose();
});

Deno.test("mount: errors are caught and logged", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const BadComponent: FC<Record<string, unknown>> = () => {
    throw new Error("test error");
  };

  // Should not throw
  await mount(BadComponent, {}, container);
});
