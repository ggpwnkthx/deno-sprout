// mount_test.ts - Tests for mount function
/// <reference lib="dom" />
import { assertEquals } from "@std/assert";
import { mount } from "@ggpwnkthx/sprout-islands/lib/mount";
import type { FC } from "@hono/hono/jsx";

Deno.test("mount: sets innerHTML to the rendered component output", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ name: string }> = ({ name }) =>
    `<div>Hello ${name}</div>` as unknown as ReturnType<FC<{ name: string }>>;

  await mount(Component, { name: "world" }, container);
  assertEquals(innerHTMLs.length, 1);
  assertEquals(innerHTMLs[0], "<div>Hello world</div>");
});

Deno.test("mount: innerHTML reflects props passed to component", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ count: number; label: string }> = ({ count, label }) =>
    `<span>${label}: ${count}</span>` as unknown as ReturnType<
      FC<{ count: number; label: string }>
    >;

  await mount(Component, { count: 42, label: "Answer" }, container);
  assertEquals(innerHTMLs[0], "<span>Answer: 42</span>");
});

Deno.test("mount: component receives props as first argument", async () => {
  let receivedProps: unknown = null;
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const Component: FC<{ name: string; age?: number }> = (props) => {
    receivedProps = props;
    return `<div>${props.name}</div>` as unknown as ReturnType<
      FC<{ name: string; age?: number }>
    >;
  };

  await mount(Component, { name: "Alice", age: 30 }, container);
  assertEquals(receivedProps, { name: "Alice", age: 30 });
});

Deno.test("mount: component receives props correctly when rendered multiple times", async () => {
  const results: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      results.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ value: number }> = ({ value }) =>
    `<p>Val: ${value}</p>` as unknown as ReturnType<FC<{ value: number }>>;

  await mount(Component, { value: 1 }, container);
  await mount(Component, { value: 2 }, container);
  await mount(Component, { value: 3 }, container);

  assertEquals(results, [
    "<p>Val: 1</p>",
    "<p>Val: 2</p>",
    "<p>Val: 3</p>",
  ]);
});

Deno.test("mount: does not throw when component returns empty fragment", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Empty: FC = () => `` as unknown as ReturnType<FC>;

  // Should not throw
  await mount(Empty, {}, container);
  assertEquals(innerHTMLs[0], "");
});

Deno.test("mount: does not throw when component throws", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const BadComponent: FC = () => {
    throw new Error("render error");
  };

  // Should not throw — error is caught and logged
  await mount(BadComponent, {}, container);
});

Deno.test("mount: returns a dispose function", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const Component: FC = () => `<div>test</div>` as unknown as ReturnType<FC>;

  const dispose = await mount(Component, {}, container);
  assertEquals(typeof dispose, "function");
});

Deno.test("mount: dispose is a no-op in 0.1.0 (does not throw)", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const Component: FC = () => `<div>test</div>` as unknown as ReturnType<FC>;

  const dispose = await mount(Component, {}, container);
  // Should not throw even though it's a no-op
  dispose();
});

Deno.test("mount: handles nested JSX structures", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ items: string[] }> = ({ items }) =>
    (
      `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`
    ) as unknown as ReturnType<FC<{ items: string[] }>>;

  await mount(Component, { items: ["a", "b", "c"] }, container);
  assertEquals(
    innerHTMLs[0],
    "<ul><li>a</li><li>b</li><li>c</li></ul>",
  );
});

Deno.test("mount: handles boolean and null children", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ show: boolean; name: string | null }> = ({
    show,
    name,
  }) =>
    `<div>${show ? name : "hidden"}</div>` as unknown as ReturnType<
      FC<{ show: boolean; name: string | null }>
    >;

  await mount(Component, { show: true, name: "Alice" }, container);
  assertEquals(innerHTMLs[0], "<div>Alice</div>");

  await mount(Component, { show: false, name: null }, container);
  assertEquals(innerHTMLs[1], "<div>hidden</div>");
});

Deno.test("mount: component is called exactly once per mount", async () => {
  let callCount = 0;
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(_v: string) {
      /* noop — verified by separate test */
    },
  } as unknown as Element;

  const Component: FC = () => {
    callCount++;
    return `<div>test</div>` as unknown as ReturnType<FC>;
  };

  await mount(Component, {}, container);
  assertEquals(callCount, 1);
});

// ---------------------------------------------------------------------------
// Error recovery
// ---------------------------------------------------------------------------

Deno.test("mount: error during renderToString does not throw", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const BadComponent: FC = () => {
    throw new Error("render error");
  };

  // Should not throw — error is caught and logged
  await mount(BadComponent, {}, container);
});

Deno.test("mount: returns a dispose function that is a no-op", async () => {
  const container = {
    innerHTML: "",
  } as unknown as Element;

  const Component: FC = () => `<div>test</div>` as unknown as ReturnType<FC>;

  const dispose = await mount(Component, {}, container);
  assertEquals(typeof dispose, "function");

  // calling it again should also be safe
  dispose();
  dispose();
});

Deno.test("mount: renders special unicode characters correctly", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ text: string }> = ({ text }) =>
    `<p>${text}</p>` as unknown as ReturnType<FC<{ text: string }>>;

  // Hono's renderToString does not HTML-escape JSX string interpolation;
  // it returns the raw string as-is. HTML escaping must be done by the
  // component or a sanitizer before rendering.
  await mount(Component, { text: "hello & world <tag>" }, container);
  assertEquals(innerHTMLs[0], "<p>hello & world <tag></p>");
});

Deno.test("mount: renders empty string props", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ name: string }> = ({ name }) =>
    `<span>${name}</span>` as unknown as ReturnType<FC<{ name: string }>>;

  await mount(Component, { name: "" }, container);
  assertEquals(innerHTMLs[0], "<span></span>");
});

Deno.test("mount: renders numeric and boolean props", async () => {
  const innerHTMLs: string[] = [];
  const container = {
    get innerHTML() {
      return "";
    },
    set innerHTML(v: string) {
      innerHTMLs.push(v);
    },
  } as unknown as Element;

  const Component: FC<{ count: number; active: boolean; ratio: number }> = ({
    count,
    active,
    ratio,
  }) =>
    `<span>${count} ${active} ${ratio}</span>` as unknown as ReturnType<
      FC<{ count: number; active: boolean; ratio: number }>
    >;

  await mount(Component, { count: 0, active: false, ratio: 3.14 }, container);
  assertEquals(innerHTMLs[0], "<span>0 false 3.14</span>");
});
