// Focused tests for `packages/utils/media_types.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import {
  contentTypeForFilename,
  DEFAULT_CONTENT_TYPE,
  EXTENSION_CONTENT_TYPES,
  extensionOf,
} from "./media_types.ts";

Deno.test("contentTypeForFilename: returns text/html for .html", () => {
  assertEquals(contentTypeForFilename("index.html"), "text/html; charset=utf-8");
});

Deno.test("contentTypeForFilename: returns text/javascript for .mjs", () => {
  assertEquals(contentTypeForFilename("app.mjs"), "text/javascript; charset=utf-8");
});

Deno.test("contentTypeForFilename: returns application/json for .map", () => {
  assertEquals(contentTypeForFilename("runtime.abc123.map"), "application/json; charset=utf-8");
});

Deno.test("contentTypeForFilename: returns octet-stream for unknown extension", () => {
  assertEquals(contentTypeForFilename("foo.unknown"), DEFAULT_CONTENT_TYPE);
});

Deno.test("contentTypeForFilename: returns octet-stream for no extension", () => {
  assertEquals(contentTypeForFilename("Makefile"), DEFAULT_CONTENT_TYPE);
});

Deno.test("extensionOf: returns extension including the dot", () => {
  assertEquals(extensionOf("foo.html"), ".html");
  assertEquals(extensionOf("foo.bar.baz"), ".baz");
  assertEquals(extensionOf("dir/foo.css"), ".css");
  assertEquals(extensionOf("dir\\foo.txt"), ".txt");
});

Deno.test("extensionOf: returns empty string for no extension", () => {
  assertEquals(extensionOf("foo"), "");
  assertEquals(extensionOf(".htaccess"), "");
});

Deno.test("EXTENSION_CONTENT_TYPES: covers the expected keys", () => {
  const keys = Object.keys(EXTENSION_CONTENT_TYPES).sort();
  assertEquals(keys, [
    ".css",
    ".gif",
    ".html",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".map",
    ".mjs",
    ".png",
    ".svg",
    ".txt",
    ".woff",
    ".woff2",
  ]);
});
