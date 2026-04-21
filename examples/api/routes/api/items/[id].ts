import type { Context } from "@hono/hono";

// In-memory store for demonstration — resets on server restart.
// In a real app, replace with a database connection.
const items: { id: number; name: string }[] = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

// GET /api/items/[id] — get one item
export const GET = (c: Context) => {
  const id = Number(c.req.param("id"));
  const item = items.find((i) => i.id === id);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
};

// PUT /api/items/[id] — update an item
export const PUT = async (c: Context) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return c.json({ error: "Not found" }, 404);
  items[index] = { id, name: body.name };
  return c.json(items[index]);
};

// DELETE /api/items/[id] — remove an item
export const DELETE = (c: Context) => {
  const id = Number(c.req.param("id"));
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return c.json({ error: "Not found" }, 404);
  items.splice(index, 1);
  return c.json({ success: true });
};
