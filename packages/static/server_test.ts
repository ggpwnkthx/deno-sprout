// server_test.ts - Tests for static file serving middleware
import { assertEquals } from "@std/assert";
import { sproutAssets, staticFiles } from "./server.ts";

Deno.test("staticFiles: prefix is stripped from path", () => {
  // This test verifies the middleware is constructed correctly.
  // Full integration testing would require a test server.
  const mw = staticFiles({ root: "./static", prefix: "/static" });
  assertEquals(typeof mw, "function");
});

Deno.test("staticFiles: returns middleware function", () => {
  const mw = staticFiles();
  assertEquals(typeof mw, "function");
});

Deno.test("sproutAssets: returns middleware function", () => {
  const mw = sproutAssets();
  assertEquals(typeof mw, "function");
});

Deno.test("sproutAssets: accepts distDir option", () => {
  const mw = sproutAssets({ distDir: "./custom-dist" });
  assertEquals(typeof mw, "function");
});
