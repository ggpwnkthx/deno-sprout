// context.ts - Framework context types
import type { Context } from "@hono/hono";

export type { Context };
/** Framework-specific context alias -Phase 1 placeholder; will be extended in Phase 4. */
export type SproutContext = Context;
export type MiddlewareHandler = (
  c: Context,
  next: () => Promise<Response>,
) => Promise<Response>;
