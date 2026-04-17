import { assertEquals } from "@std/assert";
import { renderToString } from "./streaming.ts";

Deno.test("renderToString renders string children", async () => {
  const result = await renderToString("hello");
  assertEquals(result, "hello");
});

Deno.test("renderToString renders JSX elements", async () => {
  const result = await renderToString(<div>Hello</div>);
  assertEquals(result.includes("Hello"), true);
});
