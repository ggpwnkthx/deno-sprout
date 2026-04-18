import type { Context } from "@hono/hono";

const items: { id: number; name: string }[] = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

export const GET = (c: Context) => c.json(items);

export const POST = async (c: Context) => {
  const body = await c.req.json();
  const newItem = { id: items.length + 1, name: body.name };
  items.push(newItem);
  return c.json(newItem, 201);
};
