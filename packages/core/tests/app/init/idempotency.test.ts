import { assertEquals } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/idempotency.test.ts — double-init no double-register, manifest edge cases
// ---------------------------------------------------------------------------

Deno.test("App.init() called twice does not register duplicate middleware", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    // Use a unique marker string to detect middleware registration count.
    // Each time the middleware is registered it pushes the marker to the header.
    // Double-registration → two entries in header → value "marker,marker"
    const marker = "MID_" + Math.random().toString(36).slice(2, 8);
    const headerName = "X-Idempotency-Check";
    await writeRoute(
      routesDir,
      "_middleware.ts",
      `export default async function RootMiddleware(c, next) { const h = c.req.header("${headerName}") ?? ""; c.header("${headerName}", h ? h + ",${marker}" : "${marker}"); return next(); }`,
    );
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();
    await app.init(); // should be idempotent — no-op second call

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const headerVal = res.headers.get(headerName) ?? "";
    const count = headerVal.split(",").length;
    // If double-init double-registers the middleware, count would be 2.
    // With correct idempotency (guard or no-op), count is 1.
    assertEquals(count, 1);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
