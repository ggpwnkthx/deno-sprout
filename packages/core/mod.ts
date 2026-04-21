// @ggpwnkthx/sprout-core
// Core framework - App, routing, layouts, and middleware

export { App, type AppOptions, isDeploy } from "./app.tsx";
export { AppError, appError, AppErrorCode, AppErrorStatus } from "./error.ts";
export type { Context, MiddlewareHandler } from "./context.ts";
export type {
  DataLoader,
  ErrorPageProps,
  Handler,
  Handlers,
  LayoutComponent,
  LayoutConfig,
  NotFoundPageProps,
  PageComponent,
  PageProps,
  RouteConfig,
} from "./types.ts";
export { define } from "./lib/define.ts";
export { defineLayout } from "./lib/layout.ts";
export { defineMiddleware } from "./lib/middleware.ts";
export { Head, Meta, Title } from "./lib/head.ts";

// Re-export CORS and CSRF from @hono/hono
export { cors } from "@hono/hono/cors";
export { csrf } from "@hono/hono/csrf";
