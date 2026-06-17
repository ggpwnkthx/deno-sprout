// Tests for the @sprout/compiler published surface.
//
// Verifies that no `__`-prefixed (double-underscore) symbols appear in
// the public exports, which would pollute the JSR type declarations.
import { assertEquals } from "jsr:@std/assert@1";

Deno.test("published surface: no __-prefixed exports", async () => {
  // Dynamically import the published mod.ts surface
  const mod = await import("./mod.ts");
  const exportedKeys = Object.keys(mod);
  const underscoreKeys = exportedKeys.filter((k) => k.startsWith("__"));
  assertEquals(
    underscoreKeys,
    [],
    `published surface should not export __-prefixed symbols, but found: ${
      underscoreKeys.join(", ")
    }`,
  );
});
