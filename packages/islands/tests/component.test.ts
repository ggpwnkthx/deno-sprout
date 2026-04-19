// component.test.ts - Tests for isIsland function
import { assertEquals } from "@std/assert";
import { isIsland } from "@ggpwnkthx/sprout-islands/lib/component";

// Note: isIsland is currently a stub that always returns true.
// These tests document the expected contract: what makes something a valid island.
// False-return cases cannot be exercised until the implementation is real.
Deno.test("isIsland: returns true for plain object with render function", () => {
  const component = {
    render: () => "hello",
  };
  assertEquals(isIsland(component), true);
});

Deno.test("isIsland: returns true for object with render and other properties", () => {
  const component = {
    render: () => "hello",
    other: "prop",
  };
  assertEquals(isIsland(component), true);
});

Deno.test("isIsland: returns true for a class instance with render method", () => {
  class MyIsland {
    render() {
      return "hello";
    }
  }
  assertEquals(isIsland(new MyIsland()), true);
});

Deno.test("isIsland: returns true for a function component", () => {
  const fn = () => "hello";
  assertEquals(isIsland(fn), true);
});

Deno.test("isIsland: returns true for object with render property set to a function", () => {
  assertEquals(
    isIsland({ render: () => "hello", hydrate: () => {} }),
    true,
  );
});

Deno.test("isIsland: function name is isIsland", () => {
  assertEquals(isIsland.name, "isIsland");
});

// Note: Once isIsland is properly implemented, add tests for:
// - isIsland({}) returns false (no render function)
// - isIsland(null) returns false
// - isIsland(undefined) returns false
// - isIsland(42) returns false
// - isIsland("string") returns false
