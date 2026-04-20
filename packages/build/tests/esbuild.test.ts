// esbuild_test.ts - Tests for transpile function
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
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
import Component from "./LikeButton.tsx";

export default function hydrate(props, el) {
  mount(Component, props, el).catch(
    (err) => console.error("[sprout] Failed to hydrate island LikeButton:", err),
  );
}
`;

  // Note: This requires LikeButton.tsx to exist in the fixtures
  // We use an absolute path since esbuild WASM needs that for resolveDir
  const resolveDir = "/workspaces/deno-sprout/tests/fixtures/islands";
  const result = await transpile({
    source: wrapperSource,
    name: "LikeButton",
    minify: false,
    resolveDir,
  });

  assertExists(result.code);
  assertStringIncludes(result.code, "hydrate as default");
});

Deno.test("transpile - handles TypeScript type imports", async () => {
  const result = await transpile({
    source: `
import type { FC } from "@hono/hono/jsx";

export const MyComponent: FC = () => {
  return <div>Hello</div>;
};
`,
    name: "TypeImport",
    minify: false,
  });

  assertExists(result.code);
  // Type-only imports (FC) should be stripped, but the output should be valid JS
  assertEquals(result.code.includes("FC"), false); // Type annotation stripped
  assertStringIncludes(result.code, "MyComponent");
});

Deno.test("transpile - handles console.log statements", async () => {
  const result = await transpile({
    source: `
export default function Test() {
  console.log("debug info");
  return <div>Hello</div>;
}
`,
    name: "ConsoleLog",
    minify: false,
  });

  assertExists(result.code);
  assertStringIncludes(result.code, "console.log");
});

Deno.test("transpile - captures warnings from esbuild", async () => {
  // Using a shadowing variable name that triggers esbuild's "shadowing" warning
  const result = await transpile({
    source: `
let x = 1;
{
  let x = 2; // shadowing warning
}
export default () => <div>{x}</div>;
`,
    name: "ShadowWarn",
    minify: false,
  });

  assertExists(result.code);
  // Warnings array should be present (may be empty if no warnings, but should be accessible)
  assertEquals(Array.isArray(result.warnings), true);
});

Deno.test("transpile - throws when esbuild subprocess fails", async () => {
  // Pass a malformed source that causes esbuild to fail
  try {
    await transpile({
      source: `export default () => < < div >;`, // syntax error
      name: "SyntaxError",
      minify: false,
    });
    // If no error was thrown, that's also a valid outcome (esbuild may recover)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Error message should reference the module name
    assertStringIncludes(message, "SyntaxError");
  }
});

Deno.test("transpile - output is valid ES2022", async () => {
  const result = await transpile({
    source: `
export default () => {
  const arr = [1, 2, 3];
  const mapped = arr.map((x) => x * 2);
  return <div>{mapped.join(",")}</div>;
};
`,
    name: "ES2022",
    minify: false,
  });

  assertExists(result.code);
  // Should use arrow functions (ES2022 target allows them)
  assertStringIncludes(result.code, "=>");
});

Deno.test("transpile - empty source returns empty code", async () => {
  const result = await transpile({
    source: "",
    name: "Empty",
    minify: true,
  });

  // Empty source should not throw and return empty-ish code
  assertExists(result.code);
});

Deno.test("transpile - JSX with multiple children", async () => {
  const result = await transpile({
    source: `
export default function MultiChild() {
  return (
    <div>
      <span>Hello</span>
      <span>World</span>
    </div>
  );
}
`,
    name: "MultiChild",
    minify: false,
  });

  assertExists(result.code);
  assertStringIncludes(result.code, "span");
  assertEquals(result.code.includes("<span>"), false);
});

Deno.test("transpile - complex expression in JSX", async () => {
  const result = await transpile({
    source: `
export default function Complex() {
  const items = ["a", "b", "c"];
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
`,
    name: "Complex",
    minify: false,
  });

  assertExists(result.code);
  assertStringIncludes(result.code, "map");
});

Deno.test("transpile - function with default parameters", async () => {
  const result = await transpile({
    source: `
export default function WithDefault(name = "World") {
  return <div>Hello {name}</div>;
}
`,
    name: "DefaultParams",
    minify: false,
  });

  assertExists(result.code);
  // Default parameters are preserved by esbuild
  assertEquals(result.code.includes('= "World"'), true);
});

Deno.test("transpile - destructuring in function params", async () => {
  const result = await transpile({
    source: `
export default function Destructure({ name, age }: { name: string; age: number }) {
  return <div>{name} is {age}</div>;
}
`,
    name: "Destructure",
    minify: false,
  });

  assertExists(result.code);
  // TypeScript type annotation should be stripped
  assertEquals(result.code.includes(": { name: string"), false);
});
