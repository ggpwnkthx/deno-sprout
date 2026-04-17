// server.ts - Static file serving
import type { MiddlewareHandler } from "@hono/hono";

export function staticFiles(_options?: { root?: string }): MiddlewareHandler {
  return async (_c, next) => {
    await next();
  };
}
