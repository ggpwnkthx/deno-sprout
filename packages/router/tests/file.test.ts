// lib/file_test.ts — unit tests for filePathToPattern, sortRouteFiles, getRouteFiles
import { assertEquals, assertExists } from "@std/assert";
import {
  filePathToPattern,
  getRouteFiles,
  sortRouteFiles,
} from "@ggpwnkthx/sprout-router/lib/file";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory populated with the given relative-path → content map. */
async function makeTempRoutes(
  structure: Record<string, string>,
): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "sprout_router_test_" });
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = `${dir}/${relPath}`;
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await Deno.mkdir(parentDir, { recursive: true });
    await Deno.writeFile(fullPath, new TextEncoder().encode(content));
  }
  return dir;
}

// ---------------------------------------------------------------------------
// filePathToPattern
// ---------------------------------------------------------------------------

Deno.test("filePathToPattern converts paths correctly", () => {
  assertEquals(filePathToPattern("index.tsx"), "/");
  assertEquals(filePathToPattern("about.tsx"), "/about");
  assertEquals(filePathToPattern("blog/index.tsx"), "/blog");
  assertEquals(filePathToPattern("blog/[slug].tsx"), "/blog/:slug");
  assertEquals(filePathToPattern("blog/[...rest].tsx"), "/blog/*");
  assertEquals(filePathToPattern("(admin)/users.tsx"), "/users");
  assertEquals(filePathToPattern("(admin)/(staff)/users.tsx"), "/users");
});

Deno.test("filePathToPattern handles .ts extension as well as .tsx", () => {
  assertEquals(filePathToPattern("api/health.ts"), "/api/health");
  assertEquals(filePathToPattern("api/[id].ts"), "/api/:id");
});

Deno.test("filePathToPattern handles deeply nested static paths", () => {
  assertEquals(
    filePathToPattern("a/b/c/d.tsx"),
    "/a/b/c/d",
  );
});

Deno.test("filePathToPattern strips multiple consecutive route groups", () => {
  assertEquals(
    filePathToPattern("(auth)/(protected)/dashboard.tsx"),
    "/dashboard",
  );
});

Deno.test("filePathToPattern maps catch-all at root level", () => {
  assertEquals(filePathToPattern("[...rest].tsx"), "/*");
});

Deno.test("filePathToPattern maps dynamic segment at root level", () => {
  assertEquals(filePathToPattern("[id].tsx"), "/:id");
});

// ---------------------------------------------------------------------------
// sortRouteFiles
// ---------------------------------------------------------------------------

Deno.test("sortRouteFiles orders static before dynamic before catch-all", () => {
  const files = [
    {
      filePath: "blog/[...rest].tsx",
      urlPattern: "/blog/*",
      isReserved: false,
    },
    {
      filePath: "blog/[slug].tsx",
      urlPattern: "/blog/:slug",
      isReserved: false,
    },
    {
      filePath: "blog/about.tsx",
      urlPattern: "/blog/about",
      isReserved: false,
    },
  ];
  const sorted = sortRouteFiles(files);
  assertEquals(sorted[0].urlPattern, "/blog/about");
  assertEquals(sorted[1].urlPattern, "/blog/:slug");
  assertEquals(sorted[2].urlPattern, "/blog/*");
});

Deno.test("sortRouteFiles does not mutate the input array", () => {
  const files = [
    { filePath: "b.tsx", urlPattern: "/b", isReserved: false },
    { filePath: "a.tsx", urlPattern: "/a", isReserved: false },
  ];
  const originalFirst = files[0].urlPattern;
  const originalSecond = files[1].urlPattern;
  sortRouteFiles(files);
  assertEquals(files[0].urlPattern, originalFirst);
  assertEquals(files[1].urlPattern, originalSecond);
});

Deno.test("sortRouteFiles places shorter paths before longer paths", () => {
  const files = [
    {
      filePath: "blog/[slug]/comments.tsx",
      urlPattern: "/blog/:slug/comments",
      isReserved: false,
    },
    {
      filePath: "blog/[slug].tsx",
      urlPattern: "/blog/:slug",
      isReserved: false,
    },
    { filePath: "index.tsx", urlPattern: "/", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  assertEquals(sorted[0].urlPattern, "/");
  assertEquals(sorted[1].urlPattern, "/blog/:slug");
  assertEquals(sorted[2].urlPattern, "/blog/:slug/comments");
});

Deno.test("sortRouteFiles orders alphabetically within the same segment rank", () => {
  const files = [
    { filePath: "contact.tsx", urlPattern: "/contact", isReserved: false },
    { filePath: "about.tsx", urlPattern: "/about", isReserved: false },
    { filePath: "blog.tsx", urlPattern: "/blog", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  assertEquals(sorted[0].urlPattern, "/about");
  assertEquals(sorted[1].urlPattern, "/blog");
  assertEquals(sorted[2].urlPattern, "/contact");
});

Deno.test("sortRouteFiles returns an empty array unchanged", () => {
  assertEquals(sortRouteFiles([]), []);
});

Deno.test("sortRouteFiles handles a single item", () => {
  const files = [
    { filePath: "index.tsx", urlPattern: "/", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  assertEquals(sorted.length, 1);
  assertEquals(sorted[0].urlPattern, "/");
});

// ---------------------------------------------------------------------------
// getRouteFiles — temp directory fixtures
// ---------------------------------------------------------------------------

Deno.test("getRouteFiles discovers regular route files", async () => {
  const dir = await makeTempRoutes({
    "index.tsx": "export default () => null;",
    "about.tsx": "export default () => null;",
  });
  try {
    const routes = await getRouteFiles(dir);
    const nonReserved = routes.filter((r) => !r.isReserved);
    assertEquals(nonReserved.length, 2);
    // Sorted output: "/" (shorter) before "/about"
    assertEquals(nonReserved[0].urlPattern, "/");
    assertEquals(nonReserved[1].urlPattern, "/about");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test(
  "getRouteFiles discovers reserved files and tags them correctly",
  async () => {
    const dir = await makeTempRoutes({
      "index.tsx": "",
      "_layout.tsx": "",
      "_middleware.ts": "",
      "_error.tsx": "",
      "_404.tsx": "",
    });
    try {
      const routes = await getRouteFiles(dir);
      const reserved = routes.filter((r) => r.isReserved);
      assertEquals(reserved.length, 4);

      const byKind = Object.fromEntries(reserved.map((r) => [r.kind, r]));
      assertExists(byKind["layout"]);
      assertExists(byKind["middleware"]);
      assertExists(byKind["error"]);
      assertExists(byKind["notFound"]);

      // Reserved files always carry an empty urlPattern
      for (const r of reserved) {
        assertEquals(r.urlPattern, "");
        assertEquals(r.isReserved, true);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test("getRouteFiles maps dynamic and catch-all segments", async () => {
  const dir = await makeTempRoutes({
    "blog/[slug].tsx": "",
    "blog/[...rest].tsx": "",
  });
  try {
    const routes = await getRouteFiles(dir);
    const patterns = routes.map((r) => r.urlPattern);
    assertEquals(patterns.includes("/blog/:slug"), true);
    assertEquals(patterns.includes("/blog/*"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test(
  "getRouteFiles strips route-group directory segments from url patterns",
  async () => {
    const dir = await makeTempRoutes({
      "(admin)/users.tsx": "",
      "(admin)/(staff)/reports.tsx": "",
    });
    try {
      const routes = await getRouteFiles(dir);
      const patterns = routes.map((r) => r.urlPattern);
      assertEquals(patterns.includes("/users"), true);
      assertEquals(patterns.includes("/reports"), true);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test(
  "getRouteFiles returns routes sorted static-before-dynamic-before-wildcard",
  async () => {
    const dir = await makeTempRoutes({
      "blog/[...rest].tsx": "",
      "blog/[slug].tsx": "",
      "blog/featured.tsx": "",
    });
    try {
      const routes = await getRouteFiles(dir);
      const nonReserved = routes.filter((r) => !r.isReserved);
      assertEquals(nonReserved[0].urlPattern, "/blog/featured");
      assertEquals(nonReserved[1].urlPattern, "/blog/:slug");
      assertEquals(nonReserved[2].urlPattern, "/blog/*");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test(
  "getRouteFiles ignores files without .ts or .tsx extension",
  async () => {
    const dir = await makeTempRoutes({
      "index.tsx": "",
      "README.md": "",
      "styles.css": "",
      "data.json": "",
    });
    try {
      const routes = await getRouteFiles(dir);
      // Only the .tsx file is collected; walk filters by exts
      assertEquals(routes.length, 1);
      assertEquals(routes[0].urlPattern, "/");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);

Deno.test("getRouteFiles returns an empty array for an empty directory", async () => {
  const dir = await Deno.makeTempDir({ prefix: "sprout_router_test_empty_" });
  try {
    const routes = await getRouteFiles(dir);
    assertEquals(routes, []);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test(
  "getRouteFiles mixed: reserved + dynamic + static all coexist",
  async () => {
    const dir = await makeTempRoutes({
      "index.tsx": "",
      "about.tsx": "",
      "[id].tsx": "",
      "_layout.tsx": "",
      "_404.tsx": "",
    });
    try {
      const routes = await getRouteFiles(dir);
      const reserved = routes.filter((r) => r.isReserved);
      const nonReserved = routes.filter((r) => !r.isReserved);

      assertEquals(reserved.length, 2);
      assertEquals(nonReserved.length, 3);

      // Non-reserved sorted: "/" < "/about" < "/:id"
      assertEquals(nonReserved[0].urlPattern, "/");
      assertEquals(nonReserved[1].urlPattern, "/about");
      assertEquals(nonReserved[2].urlPattern, "/:id");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
);
