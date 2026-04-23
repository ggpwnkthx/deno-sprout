// hmr/classify.ts - classifyFsEvent unit tests
import { assertEquals, assertExists } from "@std/assert";
import { classifyFsEvent } from "../../hmr.ts";

Deno.test("classifyFsEvent - CSS file returns css-update", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/static/styles.css"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event);

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

  const result = classifyFsEvent(event);

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

  const result = classifyFsEvent(event);

  assertExists(result);
  assertEquals(result!.type, "island-update");
});

Deno.test("classifyFsEvent - .ts file inside /islands/lib/ returns island-update", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/islands/lib/helpers.ts"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event);

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

  const result = classifyFsEvent(event);

  assertExists(result);
  assertEquals(result!.type, "reload");
});

Deno.test("classifyFsEvent - .tsx not in islands returns reload", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/components/Button.tsx"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event);

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

  const result = classifyFsEvent(event);

  assertEquals(result, null);
});

Deno.test("classifyFsEvent - non-island, non-CSS file returns reload", () => {
  const event = {
    kind: "modify",
    paths: ["/path/to/file.tsx"],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event);
  assertExists(result);
  assertEquals(result!.type, "reload");
});

Deno.test("classifyFsEvent - uses first path when multiple are present", () => {
  const event = {
    kind: "modify",
    paths: [
      "/path/to/routes/index.tsx",
      "/path/to/islands/Counter.tsx",
    ],
    paths2: [],
    flag: null,
  } as unknown as Deno.FsEvent;

  const result = classifyFsEvent(event);

  assertExists(result);
  // First path is the route file, so type is "reload"
  assertEquals(result!.type, "reload");
});
