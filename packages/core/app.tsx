// app.tsx - Core App class extending Hono with JSX support
import { Hono } from "@hono/hono";
import { jsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import { fsRoutes, fsRoutesFromManifest } from "@ggpwnkthx/sprout-router/fs";
import { staticFiles } from "@ggpwnkthx/sprout-static/server";
import { deployIslandAssets } from "@ggpwnkthx/sprout-static/deploy-assets";
import { join, toFileUrl } from "@std/path";
import type { LayoutComponent } from "./types.ts";
import type { RouteModule } from "@ggpwnkthx/sprout-router/fs";
import type { RoutesManifest } from "./types.ts";

export const isDeploy: boolean = typeof Deno !== "undefined" &&
  Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;

export interface AppOptions {
  root?: string;
  routesDir?: string;
  staticDir?: string;
  distDir?: string;
  rootLayout?: LayoutComponent;
}

export class App extends Hono {
  readonly #appOptions: Required<AppOptions>;

  constructor(options: AppOptions = {}) {
    super();
    this.#appOptions = {
      root: options.root ?? Deno.cwd(),
      routesDir: options.routesDir ?? "routes",
      staticDir: options.staticDir ?? "static",
      distDir: options.distDir ?? "_dist",
      rootLayout: options.rootLayout ?? (({ children }) => <>{children}</>),
    };
  }

  init(): Promise<this> {
    if (isDeploy) {
      return this.#initDeploy();
    }
    return this.#initLocal();
  }

  async #initLocal(): Promise<this> {
    const resolvedRoutesDir = join(
      this.#appOptions.root,
      this.#appOptions.routesDir,
    );
    this.use(staticFiles({ root: this.#appOptions.staticDir }));
    await fsRoutes({
      app: this,
      dir: resolvedRoutesDir,
      onPage: async ({ pattern, layoutChain, module: _module }) => {
        const layout = await composeLayouts(
          layoutChain,
          this.#appOptions.rootLayout,
        );
        this.use(pattern, jsxRenderer(layout));
      },
    });
    this.notFound(async (c) => {
      const mod = await tryImport(join(resolvedRoutesDir, "_404.tsx"));
      if (mod?.default) {
        const component = mod.default as (
          props: Record<string, unknown>,
        ) => unknown;
        const result = await component({ url: new URL(c.req.url) });
        return c.html(String(result));
      }
      return c.text("404 Not Found", 404);
    });
    return this;
  }

  async #initDeploy(): Promise<this> {
    const [routesManifest, islandManifest] = await Promise.all([
      import(/* @import */ `./dist/routes.json`, { with: { type: "json" } }),
      import(/* @import */ `./dist/manifest.json`, { with: { type: "json" } }),
    ]);
    this.mount(
      "/_sprout",
      deployIslandAssets({ islandManifest }) as unknown as (
        request: Request,
      ) => Response | Promise<Response>,
    );
    await fsRoutesFromManifest({
      app: this,
      manifest: routesManifest as RoutesManifest,
      onPage: async ({ pattern, layoutChain }) => {
        const layout = await composeLayouts(
          layoutChain,
          this.#appOptions.rootLayout,
        );
        this.use(pattern, jsxRenderer(layout));
      },
    });
    this.notFound((c) => c.text("404 Not Found", 404));
    return this;
  }
}

async function composeLayouts(
  layoutChain: string[],
  fallbackLayout?: LayoutComponent,
): Promise<LayoutComponent> {
  if (layoutChain.length === 0) {
    return fallbackLayout ?? (({ children }) => <>{children}</>);
  }
  const modules = await Promise.all(
    layoutChain.map((filePath) => import(String(toFileUrl(filePath)))),
  );
  return modules.reduceRight<LayoutComponent>(
    (layout, mod) => {
      const modLayout = (mod as RouteModule).default as (
        props: Record<string, unknown>,
      ) => unknown;
      if (!modLayout) return layout;
      return ({ children }) => modLayout({ children, layout });
    },
    fallbackLayout ?? (({ children }) => <>{children}</>),
  );
}

async function tryImport(
  filePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await import(String(toFileUrl(filePath))) as Record<
      string,
      unknown
    >;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}
