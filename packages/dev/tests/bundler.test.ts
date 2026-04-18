// bundler_test.ts - Tests for dev island bundler
import { assertEquals } from "@std/assert";
import { devIslandBundler } from "@ggpwnkthx/sprout-dev/lib/bundler";

Deno.test("devIslandBundler - returns middleware and invalidate function", () => {
  const result = devIslandBundler({
    islandsDir: "/nonexistent",
    runtimePath: "/nonexistent/runtime.ts",
    mountPath: "/nonexistent/mount.ts",
  });

  assertEquals(typeof result.middleware, "function");
  assertEquals(typeof result.invalidate, "function");
});

Deno.test("devIslandBundler - invalidate clears cache for island", () => {
  const { invalidate } = devIslandBundler({
    islandsDir: "/nonexistent",
    runtimePath: "/nonexistent/runtime.ts",
    mountPath: "/nonexistent/mount.ts",
  });

  // Should not throw
  invalidate("/path/to/islands/Counter.tsx");
});

Deno.test("devIslandBundler - invalidate clears cache for runtime", () => {
  const { invalidate } = devIslandBundler({
    islandsDir: "/nonexistent",
    runtimePath: "/nonexistent/runtime.ts",
    mountPath: "/nonexistent/mount.ts",
  });

  // Should not throw
  invalidate("/path/to/islands/lib/runtime.ts");
});

Deno.test("devIslandBundler - invalidate clears cache for mount", () => {
  const { invalidate } = devIslandBundler({
    islandsDir: "/nonexistent",
    runtimePath: "/nonexistent/runtime.ts",
    mountPath: "/nonexistent/mount.ts",
  });

  // Should not throw
  invalidate("/path/to/islands/lib/mount.ts");
});
