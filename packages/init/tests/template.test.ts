import { assertEquals, assertExists } from "@std/assert";
import { TEMPLATES } from "../template.ts";

Deno.test("TEMPLATES contains minimal, blog, and api templates", () => {
  assertEquals(Object.keys(TEMPLATES).length, 3);
  assertExists(TEMPLATES.minimal);
  assertExists(TEMPLATES.blog);
  assertExists(TEMPLATES.api);
});

Deno.test("minimal template has required files", () => {
  const template = TEMPLATES.minimal;
  const paths = template.files.map((f) => f.path);
  assertEquals(paths.includes("deno.json"), true);
  assertEquals(paths.includes("main.ts"), true);
  assertEquals(paths.includes("routes/_layout.tsx"), true);
  assertEquals(paths.includes("routes/index.tsx"), true);
  assertEquals(paths.includes("islands/.gitkeep"), true);
  assertEquals(paths.includes("static/.gitkeep"), true);
});

Deno.test("blog template extends minimal with blog-specific files", () => {
  const template = TEMPLATES.blog;
  const paths = template.files.map((f) => f.path);
  assertEquals(paths.includes("routes/blog/_layout.tsx"), true);
  assertEquals(paths.includes("routes/blog/index.tsx"), true);
  assertEquals(paths.includes("routes/blog/[slug].tsx"), true);
  assertEquals(paths.includes("islands/LikeButton.tsx"), true);
  assertEquals(paths.includes("static/styles.css"), true);
});

Deno.test("api template has REST endpoints", () => {
  const template = TEMPLATES.api;
  const paths = template.files.map((f) => f.path);
  assertEquals(paths.includes("routes/api/items.ts"), true);
  assertEquals(paths.includes("routes/api/items/[id].ts"), true);
});

Deno.test("all templates include deno.json with sprout import", () => {
  for (const template of Object.values(TEMPLATES)) {
    const denoFile = template.files.find((f) => f.path === "deno.json");
    assertExists(denoFile, `${template.name} should have deno.json`);
    const content = JSON.parse(denoFile!.content);
    assertEquals("@ggpwnkthx/sprout" in content.imports, true);
  }
});

Deno.test("deno.json defaults to JSR import specifier", () => {
  const template = TEMPLATES.minimal;
  const denoFile = template.files.find((f) => f.path === "deno.json")!;
  const content = JSON.parse(denoFile.content);
  // Without SPROUT_LOCAL, should use JSR specifier
  assertEquals(
    content.imports["@ggpwnkthx/sprout"],
    "jsr:@ggpwnkthx/sprout@^0.1.0",
  );
});
