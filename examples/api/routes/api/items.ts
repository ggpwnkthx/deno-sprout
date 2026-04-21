import type { Context } from "@hono/hono";

// In-memory store for demonstration — resets on server restart.
// In a real app, replace with a database connection.
const items: { id: number; name: string }[] = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

// GET /api/items — list all items
export const GET = (c: Context) => c.json(items);

// POST /api/items — create a new item
export const POST = async (c: Context) => {
  const body = await c.req.json();
  const newItem = { id: items.length + 1, name: body.name };
  items.push(newItem);
  return c.json(newItem, 201);
};
