// app.tsx - Core App class extending Hono with JSX support
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import { fsRoutes, fsRoutesFromManifest } from "@ggpwnkthx/sprout-router/fs";
import { sproutAssets, staticFiles } from "@ggpwnkthx/sprout-static/server";
import { deployIslandAssets } from "@ggpwnkthx/sprout-static/deploy-assets";
import { isRoutesManifest, loadManifest } from "./lib/manifest.ts";
import type { IslandManifest } from "./lib/manifest.ts";
import { isContainedPath, SEP } from "./lib/path.ts";
import { composeLayouts } from "./lib/layout.ts";
import { tryImport } from "./lib/import.ts";
import { appError, AppErrorCode } from "./error.ts";
import { join, resolve } from "@std/path";
import type { LayoutComponent, RoutesManifest } from "./types.ts";

/**
 * App context variables — extends Hono's base context with framework fields.
 * Using this as the type parameter to `Hono` makes `c.set`/`c.get` typed.
 */
interface AppContextVariables {
  islandManifest?: IslandManifest | null;
}

/**
 * `true` when running on Deno Deploy, `false` otherwise.
 * Use this flag to conditionalize behavior between local development
 * and production deployments (e.g. different middleware or data sources).
 */
export const isDeploy: boolean = typeof Deno !== "undefined" &&
  Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;

/**
 * Options for constructing a new `App` instance.
 */
export interface AppOptions {
  /**
   * Root directory of the project. All user-supplied paths (`routesDir`,
   * `staticDir`, `distDir`) are resolved relative to this directory and
   * containment-checked against it. Defaults to `Deno.cwd()`.
   */
  root?: string;
  /**
   * Directory containing route files, relative to `root`. Defaults to `"routes"`.
   */
  routesDir?: string;
  /**
   * Directory serving static files, relative to `root`. Defaults to `"static"`.
   */
  staticDir?: string;
  /**
   * Build output directory, relative to `root`. The island manifest is loaded
   * from here. Defaults to `"_dist"`.
   */
  distDir?: string;
  /**
   * Root layout component applied to every route. Receives a `children` prop
   * containing the matched route's rendered output. Defaults to a passthrough
   * that renders `children` directly.
   */
  rootLayout?: LayoutComponent;
}

/**
 * The main application class, extended from Hono with JSX rendering,
 * file-based routing, and static asset support.
 *
 * Initialize with `await app.init()` before passing to a server.
 *
 * @example
 * const app = new App({ root: "./my-project" });
 * await app.init();
 * export default app;
 */
export class App extends Hono<{ Variables: AppContextVariables }> {
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

  /** OS path separator, derived once. */
  get #sep(): string {
    return SEP;
  }

  async #initLocal(): Promise<this> {
    const sep = this.#sep;
    const rootReal = await Deno.realPath(this.#appOptions.root);

    const resolvedRoutesDir = join(
      this.#appOptions.root,
      this.#appOptions.routesDir,
    );
    let resolvedRoutesDirReal: string;
    try {
      resolvedRoutesDirReal = await Deno.realPath(resolvedRoutesDir);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        throw appError(
          AppErrorCode.ROUTES_DIR_NOT_FOUND,
          `routesDir "${resolvedRoutesDir}" does not exist or is not readable`,
          resolvedRoutesDir,
          500,
        );
      }
      throw e;
    }
    if (!(await isContainedPath(resolvedRoutesDirReal, rootReal, sep))) {
      throw appError(
        AppErrorCode.ROUTES_DIR_ESCAPED,
        `routesDir "${resolvedRoutesDir}" escaped project root "${rootReal}"`,
        resolvedRoutesDir,
        403,
      );
    }

    // Mount sproutAssets first for /_sprout/* requests
    this.use(sproutAssets({ distDir: this.#appOptions.distDir }));

    // Validate staticDir containment — must be within root, fail fast if escaped.
    const resolvedStaticDir = join(
      this.#appOptions.root,
      this.#appOptions.staticDir,
    );
    try {
      const resolvedStaticDirReal = await Deno.realPath(resolvedStaticDir);
      if (!(await isContainedPath(resolvedStaticDirReal, rootReal, sep))) {
        throw appError(
          AppErrorCode.STATIC_DIR_ESCAPED,
          `staticDir "${resolvedStaticDir}" escaped project root "${rootReal}"`,
          resolvedStaticDir,
          403,
        );
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    this.use(staticFiles({ root: this.#appOptions.staticDir }));

    // Validate distDir containment only if the directory exists.
    const resolvedDistDir = join(
      this.#appOptions.root,
      this.#appOptions.distDir,
    );
    try {
      const resolvedDistDirReal = await Deno.realPath(resolvedDistDir);
      if (!(await isContainedPath(resolvedDistDirReal, rootReal, sep))) {
        throw appError(
          AppErrorCode.DIST_DIR_ESCAPED,
          `distDir "${resolvedDistDir}" escaped project root "${rootReal}"`,
          resolvedDistDir,
          403,
        );
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    const manifest = await loadManifest(resolvedDistDir);
    if (manifest?.islands) {
      this.#islandManifest = manifest.islands;
    }
    if (manifest) {
      this.use((c, next) => {
        c.set("islandManifest", manifest);
        return next();
      });
    }
    await fsRoutes({
      app: this,
      dir: resolvedRoutesDir,
      onPage: async ({ pattern, layoutChain, module: _module }) => {
        let layout: LayoutComponent;
        try {
          layout = await composeLayouts(
            layoutChain,
            this.#appOptions.rootLayout,
            rootReal,
            sep,
            AbortSignal.timeout(5000),
          );
        } catch (e) {
          throw appError(
            AppErrorCode.MODULE_TIMEOUT,
            `Layout chain import timed out for pattern "${pattern}"`,
            e instanceof Error ? e.message : String(e),
            500,
          );
        }
        this.use(pattern, createJsxRenderer(layout));
      },
    });
    this.notFound(async (c) => {
      const mod = await tryImport(
        resolve(resolvedRoutesDir, "_404.tsx"),
        resolvedRoutesDirReal,
        sep,
      );
      if (mod?.default) {
        const component = mod.default as (
          props: Record<string, unknown>,
        ) => unknown;
        const result = await component({ url: new URL(c.req.url) });
        c.status(404);
        return c.html(String(result));
      }
      return c.text("404 Not Found", 404);
    });
    return this;
  }

  async #initDeploy(): Promise<this> {
    const sep = this.#sep;
    const rootReal = await Deno.realPath(this.#appOptions.root);

    const [routesManifest, islandManifest] = await Promise.all([
      import(/* @import */ `./dist/routes.json`, { with: { type: "json" } }),
      import(/* @import */ `./dist/manifest.json`, { with: { type: "json" } }),
    ]);

    const rawRoutes = (routesManifest as { default?: unknown }).default;
    if (!isRoutesManifest(rawRoutes)) {
      throw appError(
        AppErrorCode.MANIFEST_LOAD_FAILED,
        "routes.json does not match the expected RoutesManifest shape",
        "isRoutesManifest guard failed",
        500,
      );
    }

    this.mount(
      "/_sprout",
      deployIslandAssets({ islandManifest }) as unknown as (
        request: Request,
      ) => Response | Promise<Response>,
    );
    await fsRoutesFromManifest({
      app: this,
      manifest: rawRoutes as RoutesManifest,
      onPage: async ({ pattern, layoutChain }) => {
        let layout: LayoutComponent;
        try {
          layout = await composeLayouts(
            layoutChain,
            this.#appOptions.rootLayout,
            rootReal,
            sep,
            AbortSignal.timeout(5000),
          );
        } catch (e) {
          throw appError(
            AppErrorCode.MODULE_TIMEOUT,
            `Layout chain import timed out for pattern "${pattern}"`,
            e instanceof Error ? e.message : String(e),
            500,
          );
        }
        this.use(pattern, createJsxRenderer(layout));
      },
    });
    this.notFound((c) => c.text("404 Not Found", 404));
    return this;
  }
}
