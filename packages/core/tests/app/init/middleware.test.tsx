import { assertEquals } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/middleware.test.tsx — _middleware.ts applied globally
// ---------------------------------------------------------------------------

Deno.test("App.init() applies _middleware.ts to all routes", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_middleware.ts",
      `
      export default async function RootMiddleware(c, next) {
        c.header("X-Sprout-Test", "applied");
        return next();
      }
    `,
    );
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<p>home</p>"; }
    `,
    );
    await writeRoute(
      routesDir,
      "about.tsx",
      `
      export default function About() { return "<p>about</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const homeRes = await app.request("/");
    assertEquals(homeRes.headers.get("X-Sprout-Test"), "applied");

    const aboutRes = await app.request("/about");
    assertEquals(aboutRes.headers.get("X-Sprout-Test"), "applied");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
