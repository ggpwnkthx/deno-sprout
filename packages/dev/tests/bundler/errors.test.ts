// bundler/errors.ts - Error handling and malformed input
// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStringIncludes } from "@std/assert";
import { devIslandBundler } from "../../lib/bundler.ts";
import { buildBundlerFixture } from "../_shared/fixtures.ts";
import { createBundlerContext } from "../_shared/context.ts";

Deno.test("runtimePath unreadable — returns typed 404 JSON", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: "/nonexistent/runtime.ts",
      mountPath: fixture.mountPath,
    });

    const { ctx, body, status } = createBundlerContext("/_sprout/hydrate.js");
    await middleware(ctx as any, () => Promise.resolve());

    assertEquals(status(), 404);
    assertStringIncludes(body(), "Runtime file not found");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("mountPath unreadable — returns typed 404 JSON", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: "/nonexistent/mount.ts",
    });

    const { ctx, body, status } = createBundlerContext(
      "/_sprout/runtime/mount.js",
    );
    await middleware(ctx as any, () => Promise.resolve());

    assertEquals(status(), 404);
    assertStringIncludes(body(), "Mount file not found");
  } finally {
    await Deno.remove(fixture.islandsDir, { recursive: true });
  }
});

Deno.test("malformed island paths fall through to next() — trailing slash", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
    });

    let nextCalled = false;
    const ctx = {
      req: { path: "/_sprout/islands/" },
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

Deno.test("malformed island paths fall through to next() — empty name", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
    });

    let nextCalled = false;
    const ctx = {
      req: { path: "/_sprout/islands/.js" },
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

Deno.test("malformed island paths fall through to next() — missing .js extension", async () => {
  const fixture = await buildBundlerFixture();
  try {
    const { middleware } = devIslandBundler({
      islandsDir: fixture.islandsDir,
      runtimePath: fixture.runtimePath,
      mountPath: fixture.mountPath,
    });

    let nextCalled = false;
    // The island "Counter" has no .js extension, so the strict regex rejects it
    const ctx = {
      req: { path: "/_sprout/islands/Counter" },
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
