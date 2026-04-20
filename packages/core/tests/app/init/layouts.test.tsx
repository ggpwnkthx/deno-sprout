import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/layouts.test.tsx — _layout.tsx, nested layouts, skipInheritedLayouts, rootLayout precedence
// ---------------------------------------------------------------------------

Deno.test("App.init() applies _layout.tsx wrapping page content", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_layout.tsx",
      `
      export default function RootLayout({ children }) {
        return "<html><body>" + children + "</body></html>";
      }
    `,
    );
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<p>content</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<html>");
    assertStringIncludes(body, "<p>content</p>");
    assertStringIncludes(body, "</body></html>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() applies root and nested _layout in correct order", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function RootLayout({ children }) { return "<div id='root'>" + children + "</div>"; }`,
    );
    await writeRoute(
      routesDir,
      "blog/_layout.tsx",
      `export default function BlogLayout({ children }) { return "<div id='blog'>" + children + "</div>"; }`,
    );
    await writeRoute(
      routesDir,
      "blog/index.tsx",
      `export default function BlogIndex() { return "<p>Hello</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/blog");
    const body = await res.text();
    // Innermost page first, then blog layout, then root layout wrapping
    assertStringIncludes(body, "<div id='root'>");
    assertStringIncludes(body, "<div id='blog'>");
    assertStringIncludes(body, "<p>Hello</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() uses fallback layout when no _layout.tsx exists", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    // No _layout.tsx anywhere
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>content</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    // Fallback identity layout: children passed through
    assertStringIncludes(body, "<p>content</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() rootLayout option overrides absence of _layout.tsx", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>inner</p>"; }`,
    );

    // Regression check: App.init() with rootLayout option does not crash
    // and correctly initializes the app even when no _layout.tsx exists
    const customLayout = ({ children }: { children: unknown }) =>
      `<div id="custom-root">${children}</div>`;

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
      rootLayout: customLayout,
    });
    await app.init();

    // Verify init does not crash and getIslandManifest works as expected
    assertEquals(app.getIslandManifest(), null);
    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<p>inner</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() route with skipInheritedLayouts skips root layout", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    // Root layout
    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function RootLayout({ children }) { return "<div id='root'>" + children + "</div>"; }`,
    );
    // Blog dir with its own layout
    await writeRoute(
      routesDir,
      "blog/_layout.tsx",
      `export default function BlogLayout({ children }) { return "<div id='blog'>" + children + "</div>"; }`,
    );
    // Blog page with skipInheritedLayouts
    await writeRoute(
      routesDir,
      "blog/skip.tsx",
      `export const config = { skipInheritedLayouts: true }; export default function Skip() { return "<p>skip</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/blog/skip");
    const body = await res.text();
    // Only blog layout should wrap, root layout is skipped
    assertStringIncludes(body, "<div id='blog'>");
    assertStringIncludes(body, "<p>skip</p>");
    assertEquals(body.includes("<div id='root'>"), false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() with both rootLayout and _layout.tsx — _layout.tsx takes precedence", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function Layout({ children }) { return "<layout-file>" + children + "</layout-file>"; }`,
    );
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>inner</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
      rootLayout: ({ children }) => `<div id="root-option">${children}</div>`,
    });
    await app.init();

    const res = await app.request("/");
    const body = await res.text();
    // _layout.tsx is found in layoutChain, so rootLayout is not used
    assertStringIncludes(body, "<layout-file>");
    assertStringIncludes(body, "<p>inner</p>");
    // rootLayout is NOT wrapped (correct — _layout.tsx exists)
    assertEquals(body.includes('<div id="root-option">'), false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
