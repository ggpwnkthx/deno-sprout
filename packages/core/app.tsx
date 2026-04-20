// app.tsx - Core App class extending Hono with JSX support
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import { fsRoutes, fsRoutesFromManifest } from "@ggpwnkthx/sprout-router/fs";
import { sproutAssets, staticFiles } from "@ggpwnkthx/sprout-static/server";
import { deployIslandAssets } from "@ggpwnkthx/sprout-static/deploy-assets";
import { loadManifest } from "./lib/manifest.ts";
import type { IslandManifest } from "./lib/manifest.ts";
import { isContainedPath } from "./lib/path.ts";
import { join, resolve, toFileUrl } from "@std/path";
import type { LayoutComponent } from "./types.ts";
import type { RouteModule } from "@ggpwnkthx/sprout-router/fs";
import type { Child } from "@hono/hono/jsx";
import type { RoutesManifest } from "./types.ts";

/**
 * App context variables — extends Hono's base context with framework fields.
 * Using this as the type parameter to `Hono` makes `c.set`/`c.get` typed.
 */
interface AppContextVariables {
  islandManifest?: IslandManifest | null;
}

export const isDeploy: boolean = typeof Deno !== "undefined" &&
  Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;

export interface AppOptions {
  root?: string;
  routesDir?: string;
  staticDir?: string;
  distDir?: string;
  rootLayout?: LayoutComponent;
}

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

  async #initLocal(): Promise<this> {
    // Resolve and validate paths: all user-supplied paths are joined with root
    // and then containment-checked against root via realPath. This prevents
    // misconfiguration where a path like "../../other" escapes the project.
    const rootReal = await Deno.realPath(this.#appOptions.root);
    const sep = Deno.build.os === "windows" ? "\\" : "/";

    const resolvedRoutesDir = join(
      this.#appOptions.root,
      this.#appOptions.routesDir,
    );
    // routesDir must exist at init time — fail fast if it doesn't
    const resolvedRoutesDirReal = await Deno.realPath(resolvedRoutesDir);
    // Allow exact match (routesDir === root) or child path (starts with root + sep)
    if (
      !(await isContainedPath(resolvedRoutesDirReal, rootReal, sep))
    ) {
      throw new Error(
        `routesDir "${resolvedRoutesDir}" escaped project root "${rootReal}"`,
      );
    }

    // Mount sproutAssets first for /_sprout/* requests
    this.use(sproutAssets({ distDir: this.#appOptions.distDir }));

    // Validate staticDir containment — must be within root, fail fast if escaped.
    // The staticDir option is passed as-is to staticFiles (it resolves relative to cwd).
    const resolvedStaticDir = join(
      this.#appOptions.root,
      this.#appOptions.staticDir,
    );
    try {
      const resolvedStaticDirReal = await Deno.realPath(resolvedStaticDir);
      if (
        !(await isContainedPath(resolvedStaticDirReal, rootReal, sep))
      ) {
        throw new Error(
          `staticDir "${resolvedStaticDir}" escaped project root "${rootReal}"`,
        );
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    this.use(staticFiles({ root: this.#appOptions.staticDir }));

    // Try to load island manifest from distDir
    const resolvedDistDir = join(
      this.#appOptions.root,
      this.#appOptions.distDir,
    );
    // Validate distDir containment only if the directory exists.
    // If it doesn't exist yet (pre-build), loadManifest() will return null gracefully.
    try {
      const resolvedDistDirReal = await Deno.realPath(resolvedDistDir);
      // Allow exact match (distDir === root) or child path (starts with root + sep)
      if (
        !(await isContainedPath(resolvedDistDirReal, rootReal, sep))
      ) {
        throw new Error(
          `distDir "${resolvedDistDir}" escaped project root "${rootReal}"`,
        );
      }
    } catch (e) {
      if (
        !(e instanceof Deno.errors.NotFound)
      ) throw e; // re-throw unexpected errors (permission, etc.)
    }
    const manifest = await loadManifest(resolvedDistDir);
    if (manifest?.islands) {
      this.#islandManifest = manifest.islands;
    }
    // Expose manifest on context for all routes (layouts may read it)
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
        const layout = await composeLayouts(
          layoutChain,
          this.#appOptions.rootLayout,
          rootReal,
          sep,
        );
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
    // Resolve root to its realPath for containment validation of layout chains
    const rootReal = await Deno.realPath(this.#appOptions.root);
    const sep = Deno.build.os === "windows" ? "\\" : "/";

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
          rootReal,
          sep,
        );
        this.use(pattern, createJsxRenderer(layout));
      },
    });
    this.notFound((c) => c.text("404 Not Found", 404));
    return this;
  }
}

const IDENTITY_LAYOUT: LayoutComponent = ({ children }) => <>{children}</>;

/**
 * Resolve a layout chain into a single LayoutComponent.
 *
 * Layouts whose realPath cannot be resolved (file deleted, permission denied)
 * or whose realPath escapes `rootReal` are silently skipped. This is intentional
 * for deploy-mode manifests: fail-open prevents a broken layout file from crashing
 * the entire request; the page renders without the unavailable layout wrapper.
 *
 * When `rootReal` is not provided, only ".." segment filtering is applied —
 * absolute paths like "/etc/passwd" are NOT rejected. Callers must ensure
 * manifests originate from a trusted build step.
 */
async function composeLayouts(
  layoutChain: string[],
  fallbackLayout?: LayoutComponent,
  rootReal?: string,
  sep?: string,
): Promise<LayoutComponent> {
  if (layoutChain.length === 0) {
    return fallbackLayout ?? IDENTITY_LAYOUT;
  }

  // Validate each layout path before importing. If rootReal is provided,
  // the resolved path must be within rootReal. This prevents a malicious
  // manifest from injecting layout files outside the project tree.
  const validPaths: string[] = [];
  for (const filePath of layoutChain) {
    if (rootReal && sep) {
      try {
        const absReal = await Deno.realPath(filePath);
        if (
          absReal !== rootReal &&
          !absReal.startsWith(rootReal + sep)
        ) {
          continue; // escaped — skip this layout
        }
        validPaths.push(absReal);
      } catch {
        continue; // path doesn't exist or unreadable — skip
      }
    } else {
      // No root provided: reject ".." segments as a safety fallback
      if (filePath.includes("..")) continue;
      validPaths.push(filePath);
    }
  }

  const modules = await Promise.all(
    validPaths.map((filePath) => import(String(toFileUrl(filePath)))),
  );
  return modules.reduceRight<LayoutComponent>(
    (inner, mod) => {
      const modLayout = (mod as RouteModule).default as (
        props: Record<string, unknown>,
      ) => Child;
      if (!modLayout) return inner;
      return ({ children }) => modLayout({ children });
    },
    fallbackLayout ?? IDENTITY_LAYOUT,
  );
}

/**
 * Attempt to import a route module (e.g. _404.tsx).
 * Returns null if: the file does not exist, the path escapes routesDirReal,
 * or the module has no default export.
 * Re-throws on unexpected errors (permission denied, symlink loops, etc.)
 * — these indicate configuration problems, not missing files.
 */
async function tryImport(
  filePath: string,
  routesDirReal?: string,
  sep?: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Containment check: if routesDirReal is provided, the resolved path must
    // be within it. This prevents a planted symlink at _404.tsx from importing
    // files outside the routes directory.
    if (routesDirReal && sep) {
      const absReal = await Deno.realPath(filePath);
      if (
        absReal !== routesDirReal &&
        !absReal.startsWith(routesDirReal + sep)
      ) {
        return null; // escaped — skip custom 404 handler
      }
    }
    await Deno.stat(filePath);
    return await import(String(toFileUrl(filePath))) as Record<
      string,
      unknown
    >;
  } catch (e) {
    if (
      e instanceof Deno.errors.NotFound ||
      e instanceof TypeError // Module not found
    ) {
      return null;
    }
    throw e;
  }
}
