import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { resolveLayoutChain, resolveMiddlewareChain } from "../groups.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write an empty stub file, creating parent directories as needed. */
async function touch(filePath: string): Promise<void> {
  await Deno.mkdir(join(filePath, ".."), { recursive: true });
  await Deno.writeFile(filePath, new Uint8Array());
}

// ---------------------------------------------------------------------------
// resolveLayoutChain
// ---------------------------------------------------------------------------

Deno.test(
  "resolveLayoutChain returns only root layout for depth-0 route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Root layout exists.
      await touch(join(routesDir, "_layout.tsx"));

      // Route sits directly inside routesDir - depth 0.
      const routeFile = join(routesDir, "index.tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      assertEquals(chain, [join(routesDir, "_layout.tsx")]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveLayoutChain returns chain in correct order for nested route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Root layout and one nested layout.
      await touch(join(routesDir, "_layout.tsx"));
      await touch(join(routesDir, "blog", "_layout.tsx"));

      // Route is one level deep inside `blog/`.
      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      // Root layout must come first; nested layout second.
      assertEquals(chain, [
        join(routesDir, "_layout.tsx"),
        join(routesDir, "blog", "_layout.tsx"),
      ]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveLayoutChain uses intermediate-only layout when root has none",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Only blog/_layout.tsx exists; no root _layout.tsx
      await touch(join(routesDir, "blog", "_layout.tsx"));

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      // Chain should contain only blog/_layout.tsx
      assertEquals(chain.length, 1);
      assertEquals(chain[0], join(routesDir, "blog", "_layout.tsx"));
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveLayoutChain returns empty chain when no layout files exist",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // No _layout files anywhere
      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      assertEquals(chain, []);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveLayoutChain returns empty chain for depth-0 route with no layouts",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      const routeFile = join(routesDir, "index.tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      assertEquals(chain, []);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveLayoutChain skips missing intermediate but keeps later layout",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Root layout and deep layout, but no intermediate blog/_layout.tsx
      await touch(join(routesDir, "_layout.tsx"));
      await touch(join(routesDir, "blog", "posts", "_layout.tsx"));

      const routeFile = join(routesDir, "blog", "posts", "index.tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      // Only root and the explicit posts layout
      assertEquals(chain.length, 2);
      assertEquals(chain[0], join(routesDir, "_layout.tsx"));
      assertEquals(chain[1], join(routesDir, "blog", "posts", "_layout.tsx"));
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// resolveMiddlewareChain - deeper chains
// ---------------------------------------------------------------------------

Deno.test(
  "resolveMiddlewareChain returns chain for three-level deep route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      await touch(join(routesDir, "_middleware.ts"));
      await touch(join(routesDir, "blog", "_middleware.ts"));
      await touch(join(routesDir, "blog", "posts", "_middleware.ts"));

      const routeFile = join(routesDir, "blog", "posts", "index.tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      // Walk collects deepest first, then root prepended. Order: [root, blog/posts, blog]
      assertEquals(chain.length, 3);
      assertEquals(chain[0], join(routesDir, "_middleware.ts"));
      assertEquals(
        chain[1],
        join(routesDir, "blog", "posts", "_middleware.ts"),
      );
      assertEquals(chain[2], join(routesDir, "blog", "_middleware.ts"));
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain uses intermediate-only middleware when root has none",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Only blog/_middleware.ts exists
      await touch(join(routesDir, "blog", "_middleware.ts"));

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain.length, 1);
      assertEquals(chain[0], join(routesDir, "blog", "_middleware.ts"));
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain returns empty chain when no middleware files exist",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain, []);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain skips missing intermediate but keeps later middleware",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Root and deep middleware, no intermediate
      await touch(join(routesDir, "_middleware.ts"));
      await touch(join(routesDir, "blog", "posts", "_middleware.ts"));

      const routeFile = join(routesDir, "blog", "posts", "index.tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain.length, 2);
      assertEquals(chain[0], join(routesDir, "_middleware.ts"));
      assertEquals(
        chain[1],
        join(routesDir, "blog", "posts", "_middleware.ts"),
      );
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);
