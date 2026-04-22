// bundler/cache.ts - Cache invalidation
import { assertEquals, assertStringIncludes } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";
import { createBundlerContext } from "../_shared/context.ts";

Deno.test("invalidate(island) removes that island from cache and re-transpiles with new content", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware, invalidate } = devIslandBundler({
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

    // Populate cache
    const cached = await makeReq("/_sprout/islands/Counter.js");
    assertStringIncludes(cached, "Counter");

    // Invalidate — removes "Counter" entry from cache
    invalidate("/path/to/islands/Counter.tsx");

    // Modify island so next transpilation differs
    await Deno.writeTextFile(
      fixture.islandPath,
      `export default function Counter() { return "<p>modified</p>"; }`,
    );

    // Next request re-transpiles
    const recached = await makeReq("/_sprout/islands/Counter.js");
    assertStringIncludes(recached, "modified");
    assertEquals(cached !== recached, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("invalidate(runtime path) clears hydrate cache entry", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware, invalidate } = devIslandBundler({
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

    const cached = await makeReq("/_sprout/hydrate.js");
    assertStringIncludes(cached, "hydrate");

    invalidate("/path/to/islands/lib/runtime.ts");

    const recached = await makeReq("/_sprout/hydrate.js");
    assertStringIncludes(recached, "hydrate");
    assertEquals(recached.length > 0, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("invalidate(mount path) clears mount cache entry", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware, invalidate } = devIslandBundler({
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

    const cached = await makeReq("/_sprout/runtime/mount.js");
    assertStringIncludes(cached, "mount");

    invalidate("/path/to/islands/lib/mount.ts");

    const recached = await makeReq("/_sprout/runtime/mount.js");
    assertStringIncludes(recached, "mount");
    assertEquals(recached.length > 0, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});
