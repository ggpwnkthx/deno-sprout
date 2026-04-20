// server/routes.ts - HMR injection, island bundler routes, hydrate, mount, WS
import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildFixture, createServerAndClose, writeIsland } from "../helpers.ts";

// ---------------------------------------------------------------------------
// HMR script injection
// ---------------------------------------------------------------------------

Deno.test("createDevServer injects HMR WebSocket script into HTML responses", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "ws://");
    assertStringIncludes(body, "/_sprout/hmr");
    assertStringIncludes(body, "WebSocket");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer does NOT inject HMR script into non-HTML responses", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);

    // Register a raw route that returns application/json
    (app as unknown as {
      get(
        path: string,
        handler: (c: unknown) => Response | Promise<Response>,
      ): void;
    })
      .get("/api/data", () => {
        return new Response('{"ok":true}', {
          headers: { "Content-Type": "application/json" },
        });
      });

    const res = await app.request("/api/data");
    assertEquals(res.headers.get("content-type"), "application/json");
    const body = await res.text();
    assertEquals(body.includes("ws://"), false);
    assertEquals(body.includes("/_sprout/hmr"), false);
    assertEquals(body, '{"ok":true}');
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer skips HMR injection when HTML lacks </body>", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);

    (app as unknown as {
      get(
        path: string,
        handler: (c: unknown) => Response | Promise<Response>,
      ): void;
    })
      .get("/no-body", () => {
        return new Response("<html><p>No body tag here", {
          headers: { "Content-Type": "text/html" },
        });
      });

    const res = await app.request("/no-body");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/html");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Island bundler routes
// ---------------------------------------------------------------------------

Deno.test("createDevServer responds to /_sprout/islands/:name.js with bundled JS", async () => {
  const fixture = await buildFixture();
  try {
    await writeIsland(
      fixture.islandsDir,
      "Counter.tsx",
      `export default function Counter({ initialCount = 0 }) {
        return "<p>Count: " + initialCount + "</p>";
      }`,
    );

    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/_sprout/islands/Counter.js");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/javascript");
    const body = await res.text();
    assertStringIncludes(body, "Counter");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer returns 404 for a non-existent island", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/_sprout/islands/DoesNotExist.js");
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "not found");
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer responds to /_sprout/hydrate.js with transpiled runtime", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/_sprout/hydrate.js");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/javascript");
    const body = await res.text();
    assertEquals(body.length > 0, true);
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer responds to /_sprout/runtime/mount.js with transpiled mount", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/_sprout/runtime/mount.js");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "application/javascript");
    const body = await res.text();
    assertEquals(body.length > 0, true);
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});

Deno.test("createDevServer registers /_sprout/hmr WebSocket endpoint", async () => {
  const fixture = await buildFixture();
  try {
    const app = await createServerAndClose(fixture.root);
    const res = await app.request("/_sprout/hmr");
    assertEquals(res.status !== 404, true);
    assertEquals(res.status, 101);
  } finally {
    await Deno.remove(fixture.root, { recursive: true });
  }
});
