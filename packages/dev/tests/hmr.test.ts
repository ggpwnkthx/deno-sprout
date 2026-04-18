// hmr_test.ts - Tests for HMR functions
import { assertEquals, assertExists } from "@std/assert";
import { classifyFsEvent, createHmrHandler, watchFiles } from "../hmr.ts";

Deno.test("classifyFsEvent - CSS file returns css-update", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/static/styles.css"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event, "/path/to");

  assertExists(result);
  assertEquals(result!.type, "css-update");
  assertEquals(result!.path, "/path/to/static/styles.css");
});

Deno.test("classifyFsEvent - island .tsx returns island-update", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/islands/Counter.tsx"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event, "/path/to");

  assertExists(result);
  assertEquals(result!.type, "island-update");
});

Deno.test("classifyFsEvent - island .ts returns island-update", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/islands/Button.ts"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event, "/path/to");

  assertExists(result);
  assertEquals(result!.type, "island-update");
});

Deno.test("classifyFsEvent - route file returns reload", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/routes/index.tsx"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event, "/path/to");

  assertExists(result);
  assertEquals(result!.type, "reload");
});

Deno.test("classifyFsEvent - empty paths returns null", () => {
  const event = {
    kind: "modify",
    paths: [],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event, "/path/to");

  assertEquals(result, null);
});

Deno.test("createHmrHandler - returns handler and broadcast function", () => {
  const { handler, broadcast } = createHmrHandler();

  assertEquals(typeof handler, "function");
  assertEquals(typeof broadcast, "function");
});

Deno.test("watchFiles - returns close function", () => {
  // Use a non-existent directory to avoid file system side effects
  const result = watchFiles(["/nonexistent/path"], () => { });

  assertEquals(typeof result.close, "function");
  result.close();
});
