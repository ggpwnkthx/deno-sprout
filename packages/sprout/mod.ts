/**
 * @ggpwnkthx/sprout - public surface
 *
 * This is the main entry point for the `@ggpwnkthx/sprout` package. It re-exports
 * core application primitives, layout/middleware helpers, head management utilities,
 * and reactive signal primitives from the underlying `@ggpwnkthx/sprout-*` packages.
 *
 * Sprout uses file-based routing. Place route files inside a `routes/` directory
 * under your project root — no programmatic route array is required.
 *
 * @example
 * ```ts
 * import { createApp, defineLayout, signal } from "@ggpwnkthx/sprout";
 *
 * const count = signal(0);
 *
 * // createApp() scans the routes/ directory under Deno.cwd()
 * const app = await createApp();
 * ```
 *
 * @module
 */

// Re-exports from core app and context
import { App, isDeploy } from "@ggpwnkthx/sprout-core/app";
import type { AppOptions } from "@ggpwnkthx/sprout-core/app";
export { App, isDeploy };
export type { AppOptions };
export type { SproutContext } from "@ggpwnkthx/sprout-core/context";

// Re-exports from core types (route config, page props, handlers, etc.)
export type {
  DataLoader,
  ErrorPageProps,
  Handler,
  Handlers,
  LayoutComponent,
  NotFoundPageProps,
  PageComponent,
  PageProps,
  RouteConfig,
} from "@ggpwnkthx/sprout-core/types";

// Re-exports from core lib helpers
export { define } from "@ggpwnkthx/sprout-core/lib/define";
export { defineLayout } from "@ggpwnkthx/sprout-core/lib/layout";
export { defineMiddleware } from "@ggpwnkthx/sprout-core/lib/middleware";

// Head management (Title, Meta, Head)
export { Head, Meta, Title } from "@ggpwnkthx/sprout-core/lib/head";

// Reactive signal primitives from the islands runtime
export {
  batch,
  computed,
  effect,
  signal,
} from "@ggpwnkthx/sprout-islands/signals";

/**
 * Creates and initializes a new Sprout application instance.
 *
 * Sprout uses file-based routing: route files are loaded from the `routes`
 * directory under `root`. Pass `root` to point at your project directory.
 *
 * @param options - Optional configuration for the application. Defaults to
 *   `{ root: Deno.cwd(), routesDir: "routes", staticDir: "static", distDir: "_dist" }`.
 *   See {@link AppOptions}.
 * @returns A fully initialized {@link App} instance ready to handle requests.
 * @see {@link AppOptions}
 *
 * @example
 * ```ts
 * import { createApp } from "@ggpwnkthx/sprout";
 *
 * // Looks for ./routes, ./static, and ./dist under the current directory.
 * const app = await createApp();
 *
 * // Or specify a project root explicitly:
 * const app = await createApp({ root: "./my-project" });
 * ```
 */
export async function createApp(options?: AppOptions): Promise<App> {
  const { App: AppClass } = await import("@ggpwnkthx/sprout-core/app");
  const app = new AppClass(options);
  await app.init();
  return app;
}
