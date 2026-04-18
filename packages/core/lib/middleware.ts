// lib/middleware.ts - Middleware helpers
import type { MiddlewareHandler } from "@hono/hono";

export const defineMiddleware = (
  handler: MiddlewareHandler,
): MiddlewareHandler => {
  return handler;
};

export type { MiddlewareHandler };
