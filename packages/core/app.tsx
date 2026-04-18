// app.tsx - Core App class extending Hono with JSX support
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import { fsRoutes, fsRoutesFromManifest } from "@ggpwnkthx/sprout-router/fs";
import { sproutAssets, staticFiles } from "@ggpwnkthx/sprout-static/server";
import { deployIslandAssets } from "@ggpwnkthx/sprout-static/deploy-assets";
import { loadManifest } from "./lib/manifest.ts";
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
  #islandManifest: Record<string, string> | null = null;

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

  /** Returns the island manifest for building correct asset URLs. */
  getIslandManifest(): Record<string, string> | null {
    return this.#islandManifest;
  }

  async #initLocal(): Promise<this> {
    const resolvedRoutesDir = join(
      this.#appOptions.root,
      this.#appOptions.routesDir,
    );
    // Mount sproutAssets first for /_sprout/* requests
    this.use(sproutAssets({ distDir: this.#appOptions.distDir }));
    this.use(staticFiles({ root: this.#appOptions.staticDir }));
    // Try to load island manifest from distDir
    const manifest = await loadManifest(this.#appOptions.distDir);
    if (manifest?.islands) {
      this.#islandManifest = manifest.islands;
    }
    // Expose manifest on context for all routes (layouts may read it)
    if (manifest) {
      this.use((c, next) => {
        // Using type assertion for custom context variable - Hono's c.set() requires
        // the key to be typed on the Context, but we store this for framework use.
        (c as unknown as { set: (k: string, v: unknown) => void }).set(
          "islandManifest",
          manifest,
        );
        return next();
      });
    }
    await fsRoutes({
      app: this,
      dir: resolvedRoutesDir,
      onPage: async ({ pattern, layoutChain, module: _module }) => {
        const layout = await composeLayouts(
          layoutChain,
          this.#appOptions.rootLayout,
        );
        this.use(pattern, createJsxRenderer(layout));
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
        this.use(pattern, createJsxRenderer(layout));
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
    (inner, mod) => {
      const modLayout = (mod as RouteModule).default as (
        props: Record<string, unknown>,
      ) => unknown;
      if (!modLayout) return inner;
      return ({ children }) => modLayout({ children });
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
