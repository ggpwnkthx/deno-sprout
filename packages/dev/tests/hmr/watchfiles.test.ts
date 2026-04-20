// hmr/watchfiles.ts - watchFiles behavior
import {
  assertEquals,
  assertExists,
  assertGreaterOrEqual,
  assertLessOrEqual,
} from "@std/assert";
import { watchFiles } from "../../hmr.ts";
import type { HmrEvent } from "../../hmr.ts";
import { join } from "@std/path";

Deno.test("watchFiles returns close function", () => {
  const result = watchFiles(["/nonexistent/path"], () => {});
  assertEquals(typeof result.close, "function");
  result.close();
});

Deno.test("watchFiles with non-existent directory does not call onEvent", async () => {
  let called = false;
  const result = watchFiles(["/nonexistent/path"], () => {
    called = true;
  });

  await new Promise((r) => setTimeout(r, 100));
  assertEquals(called, false);

  result.close();
});

Deno.test("watchFiles calls onEvent when a watched file is created", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-hmr-watch-" });
  const watchDir = join(tmpDir, "subdir");
  await Deno.mkdir(watchDir, { recursive: true });

  try {
    const events: HmrEvent[] = [];
    const result = watchFiles([watchDir], (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 50));

    const filePath = join(watchDir, "test.txt");
    await Deno.writeTextFile(filePath, "hello");

    await new Promise((r) => setTimeout(r, 150));

    const relevant = events.find((e) => e.path === filePath);
    assertExists(relevant);
    assertEquals(relevant!.type, "reload");

    result.close();
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("watchFiles calls onEvent for CSS file with css-update classification", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-hmr-css-" });
  await Deno.mkdir(join(tmpDir, "static"), { recursive: true });

  try {
    const events: HmrEvent[] = [];
    const result = watchFiles([tmpDir], (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 50));

    const cssPath = join(tmpDir, "static", "styles.css");
    await Deno.writeTextFile(cssPath, "body { color: red; }");

    await new Promise((r) => setTimeout(r, 150));

    const relevant = events.find((e) => e.path === cssPath);
    assertExists(relevant);
    assertEquals(relevant!.type, "css-update");

    result.close();
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("watchFiles close stops all watchers and clears debounce timers", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-hmr-close-" });
  await Deno.mkdir(join(tmpDir, "routes"), { recursive: true });

  try {
    const events: HmrEvent[] = [];
    const result = watchFiles([tmpDir], (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 50));

    await Deno.writeTextFile(join(tmpDir, "routes", "index.tsx"), "content");

    result.close();

    await new Promise((r) => setTimeout(r, 200));

    const relevant = events.filter((e) => e.path.includes("index.tsx"));
    assertEquals(relevant.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("watchFiles can watch multiple directories simultaneously", async () => {
  const tmpDir1 = await Deno.makeTempDir({ prefix: "sprout-hmr-multi1-" });
  const tmpDir2 = await Deno.makeTempDir({ prefix: "sprout-hmr-multi2-" });

  try {
    const events: HmrEvent[] = [];
    const result = watchFiles([tmpDir1, tmpDir2], (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 50));

    await Deno.writeTextFile(join(tmpDir1, "file1.tsx"), "content1");
    await Deno.writeTextFile(join(tmpDir2, "file2.tsx"), "content2");

    await new Promise((r) => setTimeout(r, 150));

    assertGreaterOrEqual(events.length, 2);

    result.close();
  } finally {
    await Deno.remove(tmpDir1, { recursive: true });
    await Deno.remove(tmpDir2, { recursive: true });
  }
});

Deno.test("watchFiles debounces rapid events for the same path", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "sprout-hmr-debounce-" });

  try {
    const events: HmrEvent[] = [];
    const result = watchFiles([tmpDir], (ev) => events.push(ev));

    await new Promise((r) => setTimeout(r, 50));

    const filePath = join(tmpDir, "rapid.tsx");
    await Deno.writeTextFile(filePath, "v1");
    await Deno.writeTextFile(filePath, "v2");
    await Deno.writeTextFile(filePath, "v3");

    await new Promise((r) => setTimeout(r, 200));

    const relevant = events.filter((e) => e.path === filePath);
    assertLessOrEqual(relevant.length, 1);

    result.close();
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
