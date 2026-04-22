// bundler/shape.ts - Return shape and fall-through to next()
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";

Deno.test("devIslandBundler returns middleware and invalidate function", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const result = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });
    assertEquals(typeof result.middleware, "function");
    assertEquals(typeof result.invalidate, "function");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("devIslandBundler calls next() for unhandled paths", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
      signalsPath: fixture.signalsPath,
    });

    let nextCalled = false;
    const ctx = {
      req: { path: "/some/other/path" },
      text: () => ctx as any,
      res: new Response("", { status: 200 }),
    };
    await middleware(ctx as any, () => {
      nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(nextCalled, true);
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});
