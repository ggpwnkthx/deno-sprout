// context.ts - Framework context types
import type { Context } from "@hono/hono";

export type { Context };
/**

 * Framework-specific context alias.
 *
 * Phase 1 placeholder — the type alias documents the intent to extend
 * Hono's `Context` with framework-specific fields in a future release.
 * Currently identical to `Context`; do not rely on additional members yet.
 */
export type SproutContext = Context;
/**
 * Middleware handler function used throughout the framework.
 *
 * Matches the Hono middleware signature: receives the current context and
 * a `next` function to invoke the remaining middleware chain.
 */
export type MiddlewareHandler = (
  c: Context,
  next: () => Promise<Response>,
) => Promise<Response>;
