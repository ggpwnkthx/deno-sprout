// bundler/islands.ts - /_sprout/islands/:name.js endpoint
import { assertEquals, assertStringIncludes } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";
import { createBundlerContext } from "../_shared/context.ts";

Deno.test("islands - bundles existing island and includes component name", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    const { ctx, body, status } = createBundlerContext(
      "/_sprout/islands/Counter.js",
    );
    // deno-lint-ignore no-explicit-any
    await middleware(ctx as any, () => Promise.resolve());

    assertEquals(status(), 200);
    assertStringIncludes(body(), "Counter");
    assertStringIncludes(body(), "hydrate");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("islands - returns 404 for non-existent island", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    const { ctx, body, status } = createBundlerContext(
      "/_sprout/islands/DoesNotExist.js",
    );
    // deno-lint-ignore no-explicit-any
    await middleware(ctx as any, () => Promise.resolve());

    assertEquals(status(), 404);
    assertStringIncludes(body(), "not found");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});
