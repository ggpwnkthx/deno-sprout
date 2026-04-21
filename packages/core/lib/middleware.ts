// lib/middleware.ts - Middleware helpers
import type { MiddlewareHandler } from "@hono/hono";

/**
 * Declare a middleware handler with explicit typing.
 *
 * This is an identity function — it returns the handler unchanged at runtime.
 * The sole purpose is to make the middleware intent explicit in the code and
 * allow consumers to import the type without re-exporting from Hono directly.
 *
 * @example
 * ```ts
 * import { defineMiddleware } from "@ggpwnkthx/sprout-core/lib/middleware";
 *
 * export const timing = defineMiddleware(async (c, next) => {
 *   const t = Date.now();
 *   const res = await next();
 *   res.headers.set("X-Response-Time", `${Date.now() - t}ms`);
 *   return res;
 * });
 * ```
 */
export const defineMiddleware = (
  handler: MiddlewareHandler,
): MiddlewareHandler => {
  return handler;
};

export type { MiddlewareHandler };
