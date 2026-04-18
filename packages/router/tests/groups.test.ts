import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { resolveLayoutChain, resolveMiddlewareChain } from "./groups.ts";

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

      // Route sits directly inside routesDir — depth 0.
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
  "resolveLayoutChain skips missing intermediate layouts",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Only root layout exists; no blog/_layout.tsx.
      await touch(join(routesDir, "_layout.tsx"));

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveLayoutChain(routeFile, routesDir);

      assertEquals(chain, [join(routesDir, "_layout.tsx")]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// resolveMiddlewareChain
// ---------------------------------------------------------------------------

Deno.test(
  "resolveMiddlewareChain returns only root middleware for depth-0 route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      await touch(join(routesDir, "_middleware.ts"));

      const routeFile = join(routesDir, "index.tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain, [join(routesDir, "_middleware.ts")]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain skips missing files",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // Only root middleware — no blog/_middleware.ts.
      await touch(join(routesDir, "_middleware.ts"));

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain, [join(routesDir, "_middleware.ts")]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain collects all middleware in root-first order",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      await touch(join(routesDir, "_middleware.ts"));
      await touch(join(routesDir, "blog", "_middleware.ts"));

      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain, [
        join(routesDir, "_middleware.ts"),
        join(routesDir, "blog", "_middleware.ts"),
      ]);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "resolveMiddlewareChain returns empty array when no middleware exists",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");

      // No middleware at all.
      const routeFile = join(routesDir, "blog", "[slug].tsx");
      await touch(routeFile);

      const chain = await resolveMiddlewareChain(routeFile, routesDir);

      assertEquals(chain, []);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);
