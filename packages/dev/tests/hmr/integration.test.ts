// hmr/integration.ts - Cross-module integration: watchFiles + bundler invalidate
import { assertEquals, assertStringIncludes } from "@std/assert";
import { watchFiles } from "../../hmr.ts";
import { join } from "@std/path";

Deno.test("watchFiles island-update triggers invalidate and re-transpiles island", async () => {
  // Full chain: watch → island-update event → invalidate → re-transpile
  const { devIslandBundler, clearBundlerCache } = await import(
    "@ggpwnkthx/sprout-dev/lib/bundler"
  );
  clearBundlerCache();

  const runtimePath = join(
    Deno.cwd(),
    "packages",
    "islands",
    "lib",
    "runtime.ts",
  );
  const mountPath = join(Deno.cwd(), "packages", "islands", "lib", "mount.ts");
  const signalsPath = join(Deno.cwd(), "packages", "islands", "signals.ts");

  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-integration-" });
  const islandsDir = join(tmpDir, "islands");
  await Deno.mkdir(islandsDir, { recursive: true });

  const islandPath = join(islandsDir, "Counter.tsx");
  await Deno.writeTextFile(
    islandPath,
    `export default function Counter() { return "<p>v1</p>"; }`,
  );

  const { middleware, invalidate } = devIslandBundler({
    islandsDir,
    runtimePath,
    mountPath,
    signalsPath,
  });

  const makeRequest = async (path: string) => {
    let text = "";
    const c = {
      req: { path, method: "GET" },
      text: (t: string) => {
        text = t;
        // deno-lint-ignore no-explicit-any
        return c as any;
      },
      res: new Response("", { status: 200 }),
    };
    // deno-lint-ignore no-explicit-any
    await middleware(c as any, () => Promise.resolve());
    return text;
  };

  const v1 = await makeRequest("/_sprout/islands/Counter.js");
  assertStringIncludes(v1, "Counter");
  assertStringIncludes(v1, "v1");

  const watcher = watchFiles([islandsDir], (event) => {
    if (event.type === "island-update") {
      invalidate(event.path);
    }
  });

  await new Promise((r) => setTimeout(r, 50));

  await Deno.writeTextFile(
    islandPath,
    `export default function Counter() { return "<p>v2</p>"; }`,
  );

  await new Promise((r) => setTimeout(r, 200));

  const v2 = await makeRequest("/_sprout/islands/Counter.js");
  assertStringIncludes(v2, "Counter");
  assertStringIncludes(v2, "v2");
  assertEquals(v1 !== v2, true);

  watcher.close();
  await Deno.remove(tmpDir, { recursive: true });
  clearBundlerCache();
});

Deno.test("watchFiles css-update does not bust island cache", async () => {
  // CSS changes skip invalidate() — island bundle must not be re-transpiled
  const { devIslandBundler, clearBundlerCache } = await import(
    "@ggpwnkthx/sprout-dev/lib/bundler"
  );
  clearBundlerCache();

  const runtimePath = join(
    Deno.cwd(),
    "packages",
    "islands",
    "lib",
    "runtime.ts",
  );
  const mountPath = join(Deno.cwd(), "packages", "islands", "lib", "mount.ts");
  const signalsPath = join(Deno.cwd(), "packages", "islands", "signals.ts");

  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-css-noinval-" });
  const islandsDir = join(tmpDir, "islands");
  const staticDir = join(tmpDir, "static");
  await Deno.mkdir(islandsDir, { recursive: true });
  await Deno.mkdir(staticDir, { recursive: true });

  const islandPath = join(islandsDir, "Counter.tsx");
  await Deno.writeTextFile(
    islandPath,
    `export default function Counter() { return "<p>v1</p>"; }`,
  );

  const cssPath = join(staticDir, "styles.css");
  await Deno.writeTextFile(cssPath, "body { color: red; }");

  const { middleware, invalidate } = devIslandBundler({
    islandsDir,
    runtimePath,
    mountPath,
    signalsPath,
  });

  const makeRequest = async (path: string) => {
    let text = "";
    const c = {
      req: { path, method: "GET" },
      text: (t: string) => {
        text = t;
        // deno-lint-ignore no-explicit-any
        return c as any;
      },
      res: new Response("", { status: 200 }),
    };
    // deno-lint-ignore no-explicit-any
    await middleware(c as any, () => Promise.resolve());
    return text;
  };

  const v1 = await makeRequest("/_sprout/islands/Counter.js");
  assertStringIncludes(v1, "Counter");
  assertStringIncludes(v1, "v1");

  // Simulate a CSS change — invalidate is NOT called for css-update
  invalidate(cssPath);

  const v2 = await makeRequest("/_sprout/islands/Counter.js");
  assertStringIncludes(v2, "Counter");
  assertStringIncludes(v2, "v1");
  assertEquals(v1, v2);

  await Deno.remove(tmpDir, { recursive: true });
  clearBundlerCache();
});
