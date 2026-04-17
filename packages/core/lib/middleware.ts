// lib/middleware.ts - Middleware helpers
import type { MiddlewareHandler } from "../context.ts";

export const defineHandlers = (
  handlers: Record<string, MiddlewareHandler> | MiddlewareHandler,
): Record<string, MiddlewareHandler> | MiddlewareHandler => {
  return handlers;
};

export const defineMiddleware = (
  handler: MiddlewareHandler,
): MiddlewareHandler => {
  return handler;
};

export type { MiddlewareHandler };
