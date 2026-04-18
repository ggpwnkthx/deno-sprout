// @ggpwnkthx/sprout — public surface
import { App, isDeploy } from "@ggpwnkthx/sprout-core/app";
import type { AppOptions } from "@ggpwnkthx/sprout-core/app";
export { App, isDeploy };
export type { AppOptions };
export type { SproutContext } from "@ggpwnkthx/sprout-core/context";
export type {
  Handler,
  Handlers,
  LayoutComponent,
  PageComponent,
  RouteConfig,
} from "@ggpwnkthx/sprout-core/types";
export { define } from "@ggpwnkthx/sprout-core/lib/define";
export { defineLayout } from "@ggpwnkthx/sprout-core/lib/layout";
export { defineMiddleware } from "@ggpwnkthx/sprout-core/lib/middleware";
export { Head, Meta, Title } from "@ggpwnkthx/sprout-core/lib/head";
export {
  batch,
  computed,
  effect,
  signal,
} from "@ggpwnkthx/sprout-islands/signals";

export async function createApp(options?: AppOptions): Promise<App> {
  const { App: AppClass } = await import("@ggpwnkthx/sprout-core/app");
  const app = new AppClass(options);
  await app.init();
  return app;
}
