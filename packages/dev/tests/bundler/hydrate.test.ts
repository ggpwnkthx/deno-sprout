// bundler/hydrate.ts - /_sprout/hydrate.js endpoint
import { assertEquals, assertStringIncludes } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";
import { createBundlerContext } from "../_shared/context.ts";

Deno.test("hydrate - first request populates cache with transpiled runtime", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    const { ctx, body, status } = createBundlerContext("/_sprout/hydrate.js");
    // deno-lint-ignore no-explicit-any
    await middleware(ctx as any, () => Promise.resolve());

    assertEquals(status(), 200);
    assertStringIncludes(body(), "hydrate");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("hydrate - second request is served from cache", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    const makeReq = async (path: string) => {
      const { ctx, body } = createBundlerContext(path);
      // deno-lint-ignore no-explicit-any
      await middleware(ctx as any, () => Promise.resolve());
      return body();
    };

    const first = await makeReq("/_sprout/hydrate.js");
    assertStringIncludes(first, "hydrate");

    // After invalidation, next request re-transpiles
    const { middleware: _mw, invalidate } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });
    invalidate("/path/to/islands/lib/runtime.ts");
    const second = await makeReq("/_sprout/hydrate.js");
    assertStringIncludes(second, "hydrate");
    assertEquals(first.length > 0, true);
    assertEquals(second.length > 0, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});
