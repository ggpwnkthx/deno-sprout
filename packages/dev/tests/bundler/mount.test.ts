// bundler/mount.ts - /_sprout/runtime/mount.js endpoint
import { assertEquals, assertStringIncludes } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";
import { createBundlerContext } from "../_shared/context.ts";

Deno.test("mount - responds with transpiled mount module", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    const { ctx, body } = createBundlerContext("/_sprout/runtime/mount.js");
    // deno-lint-ignore no-explicit-any
    await middleware(ctx as any, () => Promise.resolve());

    assertStringIncludes(body(), "mount");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("mount - second request served from cache", async () => {
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

    const first = await makeReq("/_sprout/runtime/mount.js");
    assertStringIncludes(first, "mount");

    // After invalidation, re-transpiles
    const { middleware: _mw, invalidate } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });
    invalidate("/path/to/islands/lib/mount.ts");
    const second = await makeReq("/_sprout/runtime/mount.js");
    assertStringIncludes(second, "mount");
    assertEquals(first.length > 0, true);
    assertEquals(second.length > 0, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});
