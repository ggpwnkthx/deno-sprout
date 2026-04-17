// context.ts - Framework context types
import type { Context } from "@hono/hono";

export type { Context };
export type MiddlewareHandler = (
  c: Context,
  next: () => Promise<Response>,
) => Promise<Response>;
