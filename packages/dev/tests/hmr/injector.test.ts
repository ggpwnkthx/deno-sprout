// hmr/injector.ts - hmrInjector unit tests
import { assertEquals, assertGreater, assertStringIncludes } from "@std/assert";
import { hmrInjector } from "../../server.ts";
import { createInjectorContext } from "../_shared/context.ts";

Deno.test("hmrInjector skips non-HTML responses", async () => {
  const injector = hmrInjector();
  let nextCalled = false;

  const c = createInjectorContext(
    new Response('{"ok":true}', {
      headers: { "Content-Type": "application/json" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => {
    nextCalled = true;
    return Promise.resolve();
  });

  assertEquals(nextCalled, true);
  assertEquals(c.res.headers.get("Content-Type"), "application/json");
});

Deno.test("hmrInjector skips HTML responses that lack </body>", async () => {
  const injector = hmrInjector();

  const c = createInjectorContext(
    new Response("<html><p>No body tag here", {
      headers: { "Content-Type": "text/html" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => Promise.resolve());

  assertEquals(c.res.status, 200);
  assertEquals(c.res.headers.get("Content-Type"), "text/html");
});

Deno.test("hmrInjector injects HMR WebSocket script into HTML responses with </body>", async () => {
  const injector = hmrInjector();

  const c = createInjectorContext(
    new Response("<html><body><p>Hello</p></body>", {
      headers: { "Content-Type": "text/html" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => Promise.resolve());

  const newBody = await c.res.clone().text();
  assertStringIncludes(newBody, "ws://");
  assertStringIncludes(newBody, "/_sprout/hmr");
  assertStringIncludes(newBody, "WebSocket");
  assertStringIncludes(newBody, "</body>");
  assertStringIncludes(newBody, "<p>Hello</p>");
});

Deno.test("hmrInjector preserves the original Content-Type header after injection", async () => {
  const injector = hmrInjector();

  const c = createInjectorContext(
    new Response("<html><body><p>Hello</p></body>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => Promise.resolve());

  assertEquals(c.res.headers.get("Content-Type"), "text/html; charset=utf-8");
});

Deno.test("hmrInjector with empty body skips injection and returns 200", async () => {
  const injector = hmrInjector();

  const c = createInjectorContext(
    new Response("", {
      headers: { "Content-Type": "text/html" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => Promise.resolve());

  assertEquals(c.res.status, 200);
  assertEquals(c.res.headers.get("Content-Type"), "text/html");
});

Deno.test("hmrInjector replaces only the first </body> when multiple exist", async () => {
  const injector = hmrInjector();

  const htmlWithTwoBodies =
    "<html><body><p>First</p></body><div>Middle</div><body><p>Second</p></body></html>";

  const c = createInjectorContext(
    new Response(htmlWithTwoBodies, {
      headers: { "Content-Type": "text/html" },
    }),
  );

  // deno-lint-ignore no-explicit-any
  await injector(c as any, () => Promise.resolve());

  const newBody = await c.res.clone().text();
  assertStringIncludes(newBody, "<p>First</p>");
  assertStringIncludes(newBody, "<p>Second</p>");
  const firstBodyIndex = newBody.indexOf("<p>First</p>");
  const wsScriptIndex = newBody.indexOf("ws://");
  assertGreater(wsScriptIndex, firstBodyIndex);
});
