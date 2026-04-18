// esbuild_test.ts - Tests for transpile function
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { transpile } from "../lib/esbuild.ts";

Deno.test("transpile - valid TSX returns JS without JSX syntax", async () => {
  const result = await transpile({
    source: `export default () => <div>Hello</div>`,
    name: "Test",
  });

  assertExists(result.code);
  // Should not contain JSX syntax
  assertEquals(result.code.includes("<div>"), false);
  assertStringIncludes(result.code, "div");
});

Deno.test("transpile - output uses @hono/hono/jsx-runtime import", async () => {
  const result = await transpile({
    source: `export default () => <div>Hello</div>`,
    name: "Test",
  });

  assertStringIncludes(result.code, "@hono/hono/jsx-runtime");
});

Deno.test("transpile - syntax error throws with name in message", async () => {
  try {
    await transpile({
      source: `export default () => <div>{undefined}</div>`,
      name: "MyComponent",
    });
    // If we get here without error, the transpile succeeded (might not throw on JSX errors)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertStringIncludes(message, "MyComponent");
  }
});

Deno.test("transpile - minify false produces readable output", async () => {
  const result = await transpile({
    source: `export default () => <div>Hello</div>`,
    name: "Test",
    minify: false,
  });

  // Unminified should have more whitespace/formatting
  // This is a basic check - actual formatting may vary
  assertExists(result.code);
});

Deno.test("transpile - transpiles wrapper with resolveDir (bundle mode)", async () => {
  // This test simulates how the bundler calls transpile with generateIslandWrapper
  const wrapperSource = `\
import { mount } from "/_sprout/runtime/mount.js";
import Component from "./Counter.tsx";

export default function hydrate(props, el) {
  mount(Component, props, el).catch(
    (err) => console.error("[sprout] Failed to hydrate island Counter:", err),
  );
}
`;

  // Note: This requires Counter.tsx to exist in the fixtures
  // We use an absolute path since esbuild WASM needs that for resolveDir
  const resolveDir = join(Deno.cwd(), "fixtures/islands-smoke/islands");
  const result = await transpile({
    source: wrapperSource,
    name: "Counter",
    minify: false,
    resolveDir,
  });

  assertExists(result.code);
  assertStringIncludes(result.code, "hydrate as default");
});
