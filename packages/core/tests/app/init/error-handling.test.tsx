import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/error-handling.test.tsx — _404.tsx, _error.tsx, sync/async thrown errors
// ---------------------------------------------------------------------------

Deno.test("App.init() registers _404.tsx custom not-found page", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<h1>Home</h1>"; }
    `,
    );
    await writeRoute(
      routesDir,
      "_404.tsx",
      `
      export default function NotFound({ url }) {
        return "<h1>Page not found: " + url.pathname + "</h1>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/does-not-exist");
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "Page not found: /does-not-exist");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() registers _error.tsx for thrown exceptions", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { throw new Error("boom"); }
    `,
    );
    await writeRoute(
      routesDir,
      "_error.tsx",
      `
      export default function ErrorPage({ error }) {
        return "<h1>Error: " + error.message + "</h1>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 500);
    const body = await res.text();
    assertStringIncludes(body, "Error: boom");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() async thrown errors are caught by _error.tsx", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_error.tsx",
      `
      export default function ErrorPage({ error }) {
        return "<h1>Error: " + error.message + "</h1>";
      }
    `,
    );
    await writeRoute(
      routesDir,
      "async-route.tsx",
      `
      export default async function AsyncRoute() {
        await new Promise(resolve => setTimeout(resolve, 1));
        throw new Error("async boom");
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/async-route");
    assertEquals(res.status, 500);
    const body = await res.text();
    assertStringIncludes(body, "Error: async boom");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() sync thrown errors in handler() are caught by _error.tsx", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_error.tsx",
      `
      export default function ErrorPage({ error }) {
        return "<h1>Error: " + error.message + "</h1>";
      }
    `,
    );
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export const handler = () => { throw new Error("handler sync boom"); };
      export default function Index() { return "<p>home</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 500);
    const body = await res.text();
    assertStringIncludes(body, "Error: handler sync boom");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
