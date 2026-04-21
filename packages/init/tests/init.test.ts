import { assertEquals, assertExists } from "@std/assert";
import { initProject } from "../template.ts";

Deno.test("initProject creates project with minimal template", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-test-" });
  const projectPath = `${tmpDir}/test-minimal`;

  try {
    await initProject({
      name: projectPath,
      template: "minimal",
    });

    // Check deno.json was created
    const denoContent = await Deno.readTextFile(`${projectPath}/deno.json`);
    const denoJson = JSON.parse(denoContent);
    assertEquals("@ggpwnkthx/sprout" in denoJson.imports, true);

    // Check main.ts was created
    const mainContent = await Deno.readTextFile(`${projectPath}/main.ts`);
    assertExists(mainContent);

    // Check routes/index.tsx was created
    const indexContent = await Deno.readTextFile(
      `${projectPath}/routes/index.tsx`,
    );
    assertExists(indexContent);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("initProject creates project with blog template", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-test-" });
  const projectPath = `${tmpDir}/test-blog`;

  try {
    await initProject({
      name: projectPath,
      template: "blog",
    });

    // Check blog-specific files
    const blogIndex = await Deno.readTextFile(
      `${projectPath}/routes/blog/index.tsx`,
    );
    assertExists(blogIndex);

    const slugRoute = await Deno.readTextFile(
      `${projectPath}/routes/blog/[slug].tsx`,
    );
    assertExists(slugRoute);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("initProject creates project with api template", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-test-" });
  const projectPath = `${tmpDir}/test-api`;

  try {
    await initProject({
      name: projectPath,
      template: "api",
    });

    // Check api-specific files
    const items = await Deno.readTextFile(`${projectPath}/routes/api/items.ts`);
    assertExists(items);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("initProject throws when directory already exists and is non-empty", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-test-" });

  try {
    // Create a non-empty directory
    await Deno.writeTextFile(`${tmpDir}/existing.txt`, "content");

    let error: Error | undefined;
    try {
      await initProject({
        name: tmpDir,
        template: "minimal",
      });
    } catch (e) {
      error = e as Error;
    }

    assertEquals(error instanceof Error, true);
    assertEquals(error!.message.includes("already exists"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("initProject throws when template name is invalid", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-test-" });
  const projectPath = `${tmpDir}/test-invalid`;

  try {
    let error: Error | undefined;
    try {
      await initProject({
        name: projectPath,
        template: "invalid-template" as "minimal",
      });
    } catch (e) {
      error = e as Error;
    }

    assertEquals(error instanceof Error, true);
    assertEquals(error!.message.includes("Unknown template"), true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
