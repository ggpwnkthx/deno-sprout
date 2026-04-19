// lib/file_test.ts - unit tests for filePathToPattern, sortRouteFiles, getRouteFiles
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
// filePathToPattern edge cases
// ---------------------------------------------------------------------------

Deno.test("filePathToPattern returns / for index.tsx", () => {
  assertEquals(filePathToPattern("index.tsx"), "/");
});

Deno.test("filePathToPattern returns / for index/index.tsx", () => {
  assertEquals(filePathToPattern("index/index.tsx"), "/");
});

Deno.test("filePathToPattern returns / for (group)/index.tsx", () => {
  assertEquals(filePathToPattern("(admin)/index.tsx"), "/");
});

Deno.test("filePathToPattern handles file with dots in name", () => {
  assertEquals(filePathToPattern("blog/sprout.v2.tsx"), "/blog/sprout.v2");
});

Deno.test("filePathToPattern handles route group with hyphens", () => {
  assertEquals(filePathToPattern("(my-group)/about.tsx"), "/about");
});

Deno.test("filePathToPattern preserves hyphen in regular segment", () => {
  assertEquals(filePathToPattern("my-page.tsx"), "/my-page");
});

// ---------------------------------------------------------------------------
// sortRouteFiles edge cases
// ---------------------------------------------------------------------------

Deno.test("sortRouteFiles handles urlPattern with empty string for reserved files", () => {
  const files = [
    {
      filePath: "_layout.tsx",
      urlPattern: "",
      isReserved: true,
      kind: "layout" as const,
    },
    { filePath: "index.tsx", urlPattern: "/", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  // Non-reserved should come after reserved (or they may be mixed - check stable behavior)
  assertEquals(sorted.length, 2);
});

Deno.test("sortRouteFiles all static same segment length sorts alphabetically", () => {
  const files = [
    { filePath: "z.tsx", urlPattern: "/z", isReserved: false },
    { filePath: "a.tsx", urlPattern: "/a", isReserved: false },
    { filePath: "m.tsx", urlPattern: "/m", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  assertEquals(sorted[0].urlPattern, "/a");
  assertEquals(sorted[1].urlPattern, "/m");
  assertEquals(sorted[2].urlPattern, "/z");
});

Deno.test("sortRouteFiles deeply nested static routes sorted by depth first", () => {
  const files = [
    { filePath: "a/b/c/d.tsx", urlPattern: "/a/b/c/d", isReserved: false },
    { filePath: "a.tsx", urlPattern: "/a", isReserved: false },
    { filePath: "a/b.tsx", urlPattern: "/a/b", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  // Shorter paths first
  assertEquals(sorted[0].urlPattern, "/a");
  assertEquals(sorted[1].urlPattern, "/a/b");
  assertEquals(sorted[2].urlPattern, "/a/b/c/d");
});

Deno.test("sortRouteFiles mixed static and param same depth orders correctly", () => {
  const files = [
    {
      filePath: "blog/[slug].tsx",
      urlPattern: "/blog/:slug",
      isReserved: false,
    },
    { filePath: "blog/post.tsx", urlPattern: "/blog/post", isReserved: false },
    { filePath: "blog/[id].tsx", urlPattern: "/blog/:id", isReserved: false },
  ];
  const sorted = sortRouteFiles(files);
  // Static before dynamic
  assertEquals(sorted[0].urlPattern, "/blog/post");
  assertEquals(sorted[1].urlPattern, "/blog/:id");
  assertEquals(sorted[2].urlPattern, "/blog/:slug");
});

// ---------------------------------------------------------------------------
// getRouteFiles - deeper edge cases
// ---------------------------------------------------------------------------

Deno.test("getRouteFiles does not include files outside routesDir", async () => {
  const dir = await makeTempRoutes({
    "index.tsx": "",
  });
  try {
    // Create a subdirectory that should not be walked as a route
    const nestedDir = dir + "/../sibling";
    await Deno.mkdir(nestedDir, { recursive: true });
    await Deno.writeFile(
      nestedDir + "/sibling.tsx",
      new TextEncoder().encode(""),
    );

    const routes = await getRouteFiles(dir);
    const patterns = routes.map((r) => r.urlPattern);
    // sibling route should not appear
    assertEquals(patterns.includes("/sibling"), false);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("getRouteFiles handles route group with multiple segments", async () => {
  const dir = await makeTempRoutes({
    "(auth)/(sso)/login.tsx": "",
    "(auth)/dashboard.tsx": "",
  });
  try {
    const routes = await getRouteFiles(dir);
    const patterns = routes.map((r) => r.urlPattern);
    assertEquals(patterns.includes("/login"), true);
    assertEquals(patterns.includes("/dashboard"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("getRouteFiles distinguishes files with same name in different dirs", async () => {
  const dir = await makeTempRoutes({
    "blog/index.tsx": "",
    "about/index.tsx": "",
  });
  try {
    const routes = await getRouteFiles(dir);
    const patterns = routes.map((r) => r.urlPattern);
    assertEquals(patterns.includes("/blog"), true);
    assertEquals(patterns.includes("/about"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Reserved file isolation tests
// ---------------------------------------------------------------------------

Deno.test("getRouteFiles _layout alone does not register a route", async () => {
  const dir = await makeTempRoutes({
    "_layout.tsx": "",
    "index.tsx": "",
  });
  try {
    const routes = await getRouteFiles(dir);
    const nonReserved = routes.filter((r) => !r.isReserved);
    assertEquals(nonReserved.length, 1);
    assertEquals(nonReserved[0].urlPattern, "/");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("getRouteFiles _middleware alone does not register a route", async () => {
  const dir = await makeTempRoutes({
    "_middleware.ts": "",
    "index.tsx": "",
  });
  try {
    const routes = await getRouteFiles(dir);
    const nonReserved = routes.filter((r) => !r.isReserved);
    assertEquals(nonReserved.length, 1);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// getRouteFiles - empty dir edge case already covered above
// ---------------------------------------------------------------------------

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
// getRouteFiles - temp directory fixtures
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
