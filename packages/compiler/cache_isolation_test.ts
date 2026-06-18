// Tests for the per-project-root dev cache isolation.
//
// Verifies that two projects with different roots do not share cache
// entries even if their island ids collide.
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { loadConfig } from "@sprout/config";
import { compileDevAsset } from "./mod.ts";
import { resetDevCacheForTests } from "./build/dev_assets_test_utils.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));

async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix, dir: join(REPO_ROOT, "tests/.tmp") });
  return {
    path: dir,
    cleanup: async () => {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // best-effort
      }
    },
  };
}

Deno.test("compileDevAsset: two projects with different roots do not cross-contaminate cache", async () => {
  resetDevCacheForTests();
  const tmp1 = await makeTempDir("sprout-root1-");
  const tmp2 = await makeTempDir("sprout-root2-");
  try {
    // Create an island in project 1
    const island1 = join(tmp1.path, "src/islands/Counter.tsx");
    await Deno.mkdir(join(tmp1.path, "src/islands"), { recursive: true });
    await Deno.writeTextFile(
      island1,
      "export default function Counter() { return 'project1'; }\n",
    );

    // Create the same island id in project 2 with different content
    const island2 = join(tmp2.path, "src/islands/Counter.tsx");
    await Deno.mkdir(join(tmp2.path, "src/islands"), { recursive: true });
    await Deno.writeTextFile(
      island2,
      "export default function Counter() { return 'project2'; }\n",
    );

    // Write minimal config so loadConfig doesn't try to resolve the
    // default src/styles/app.css in each tmp project.
    await Deno.writeTextFile(
      join(tmp1.path, "sprout.config.ts"),
      `export default { styles: { app: false } };\n`,
    );
    await Deno.writeTextFile(
      join(tmp2.path, "sprout.config.ts"),
      `export default { styles: { app: false } };\n`,
    );

    // Compile island1
    const config1 = await loadConfig({ root: tmp1.path });
    const result1 = await compileDevAsset({
      kind: "island",
      id: "Counter",
      entry: island1,
      publicPath: "/@sprout/island/Counter.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: config1,
      mode: "development",
    });

    // Compile island2
    const config2 = await loadConfig({ root: tmp2.path });
    const result2 = await compileDevAsset({
      kind: "island",
      id: "Counter",
      entry: island2,
      publicPath: "/sprout/island/Counter.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: config2,
      mode: "development",
    });

    // The content must differ (different source files)
    const body1 = new TextDecoder().decode(result1.js);
    const body2 = new TextDecoder().decode(result2.js);
    assertNotEquals(body1, body2, "different projects should produce different bundles");
    assertEquals(body1.includes("project1"), true, "project1 island content should be present");
    assertEquals(body2.includes("project2"), true, "project2 island content should be present");

    // Both cache keys should contain their respective roots
    assertEquals(
      result1.cacheKey.includes(tmp1.path),
      true,
      "cache key 1 should contain project 1 root",
    );
    assertEquals(
      result2.cacheKey.includes(tmp2.path),
      true,
      "cache key 2 should contain project 2 root",
    );
  } finally {
    await tmp1.cleanup();
    await tmp2.cleanup();
  }
});
