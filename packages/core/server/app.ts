// createApp and serve for @sprout/core.
//
// createApp wires the Hono router to the framework's
// route-dispatch, HTML-shell, public-file serving, and the asset
// pipeline. Two paths exist:
//
//   - **Development mode** (`mode: "development"`): on-demand
//     compile via `compileDevAsset`, `cache-control: no-store`,
//     per-asset source maps. The framework asset routes are
//     `GET /@sprout/runtime.js`, `GET /@sprout/runtime.js.map`,
//     `GET /@sprout/app.css`, `GET /@sprout/island/<id>.js`,
//     `GET /@sprout/island/<id>.js.map`.
//
//   - **Production mode** (`mode: "production"`): load the
//     frozen manifest at startup, build an O(1) public-path
//     index, and serve content-hashed assets with
//     `ETag` / `gzip` / `cache-control: immutable`. The
//     framework asset routes are `GET /@sprout/runtime.js`,
//     `GET /@sprout/app.css`, `GET /@sprout/island/<id>.js`;
//     source maps are not served (the production build does not
//     emit them). Bytes are read lazily from the on-disk
//     `_sprout/` files; an optional bounded LRU caches the
//     raw + gzip companion bytes when the user opts in via
//     `config.build.frozenAssetCache: { kind: "bounded", maxBytes }`.
//
// Server route rendering is identical between modes: the M3
// spec explicitly defers server route bundling, so the runtime
// dispatch still imports the route source files at request
// time. M7 does not change that contract.
//
// Router order:
//
//   1. Global error handler (Hono onError) converts CoreError
//      to typed HTTP responses and re-throws other errors so
//      Deno's default handler can log them.
//   2. Static-files middleware (Hono use("*", ...)) serves
//      files from publicDir. Returns next() for any path that
//      is not a public file so the next handler runs.
//   3. Framework asset routes (dev or prod, depending on mode).
//   4. Per-route handler for each manifest entry. Delegates to
//      renderRoute, which dispatches by HTTP method and wraps
//      the result in the HTML shell.
//
// Framework asset routes run after the public-file middleware
// because the public-files resolver already short-circuits to a
// Response when a public file matches; the framework routes never
// shadow a public file.
import { Hono } from "@hono/hono";
import type { ResolvedConfig } from "@sprout/config";
import { loadConfig } from "@sprout/config";
import {
  type FrozenIndex,
  loadFrozenIndex,
  readFrozenAsset,
  type ReadFrozenAssetResult,
} from "@sprout/compiler";
import { discoverProject, validateManifest } from "@sprout/compiler";
import type { Manifest } from "@sprout/compiler";
import { CoreError, coreErrorToResponse } from "./errors.ts";
import { renderRoute } from "./render_route.tsx";
import { warmupIslands } from "./warmup_islands.ts";
import { resolvePublicFile, serveStaticFile } from "./static_files.ts";
import {
  runtimeServeOptions,
  runtimeSourceMapOptions,
  serveDevAsset,
  serveDevSourceMap,
} from "./dev_assets.ts";
import { serveFrozenAsset } from "./prod_assets.ts";
import { BoundedLru } from "./lru.ts";
import { FrameworkError, NOSNIFF } from "@sprout/utils";
import type { App, AppAdvanced, CreateAppOptions, ServeOptions } from "./types.ts";

const RUNTIME_PUBLIC_PATH = "/@sprout/runtime.js";
const APP_STYLESHEET_PUBLIC_PATH = "/@sprout/app.css";
const RUNTIME_MAP_PUBLIC_PATH = "/@sprout/runtime.js.map";

/** The cache header attached to every served public file. */
const PUBLIC_FILE_CACHE_CONTROL = "public, max-age=3600";

/**
 * The M7 production-serve cache seam.
 *
 * The serve layer keys the LRU on public path. The cached value
 * is the `readFrozenAsset` result (raw bytes + optional gzip
 * companion). When `config.build.frozenAssetCache` is `"none"`
 * (the M2 default) the field is `null`; the helper always falls
 * through to the disk read.
 *
 * The LRU is the only place in the framework that holds asset
 * bytes in memory beyond a single request. The M7 spec
 * deliberately does not preload all bytes at startup; the LRU is
 * the resident-memory cap the user opts into.
 */
type ProdAssetCache = {
  readonly lru:
    | BoundedLru<string, {
      readonly bytes: Uint8Array;
      readonly gzipBytes: Uint8Array | null;
    }>
    | null;
};

/** Shared state between the asset route handlers and the test seam. */
type ProductionState = {
  readonly cache: ProdAssetCache;
};

async function buildApp(config: ResolvedConfig): Promise<App> {
  const discovered = await discoverProject(config);
  const manifest: Manifest = validateManifest(discovered);
  // Pre-register every island so per-request rendering does not pay
  // the dynamic-import cost. The registry is process-global and
  // idempotent, so this is safe to call exactly once.
  await warmupIslands(manifest);

  const hono = new Hono();

  hono.onError((err) => {
    if (err instanceof CoreError) {
      return coreErrorToResponse(err);
    }
    if (err instanceof FrameworkError) {
      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
    throw err;
  });

  hono.notFound(() => {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": NOSNIFF,
      },
    });
  });

  hono.use("*", async (c, next) => {
    if (config.publicDir === null) {
      return await next();
    }
    const filePath = await resolvePublicFile(config.publicDir, c.req.path);
    if (filePath === null) {
      return await next();
    }
    return await serveStaticFile(
      filePath,
      config.publicDir,
      undefined,
      PUBLIC_FILE_CACHE_CONTROL,
    );
  });

  let productionState: ProductionState | null = null;
  if (config.mode === "production") {
    productionState = await registerProductionAssetRoutes(hono, config);
  } else {
    registerDevAssetRoutes(hono, config, manifest);
  }

  for (const route of manifest.routes) {
    const honoPattern = route.pattern;
    hono.all(honoPattern, async (c) => {
      return await renderRoute({
        config,
        manifest,
        route,
        request: c.req.raw,
        url: new URL(c.req.url),
        params: c.req.param() as Readonly<Record<string, string>>,
        locals: new Map<string, unknown>(),
        shellInfo: {
          runtimePublicPath: RUNTIME_PUBLIC_PATH,
          stylesheetPublicPath: manifest.styles.app === null ? null : APP_STYLESHEET_PUBLIC_PATH,
        },
      });
    });
  }

  return {
    // Internal Hono reference; not exposed on the public App type.
    // Advanced consumers access via getHono() from this package.
    __hono: hono,
    fetch(request: Request): Response | Promise<Response> {
      return hono.fetch(request);
    },
    getAssetCacheStats() {
      if (productionState === null || productionState.cache.lru === null) {
        return null;
      }
      return {
        size: productionState.cache.lru.size,
        count: productionState.cache.lru.count,
      };
    },
  } as unknown as App;
}

/**
 * Register the M4 dev asset routes.
 *
 * The dev server compiles assets on demand through `compileDevAsset`,
 * so the routes are the same shape they have been since M4: the
 * five reserved framework URLs and the matching `.map` companions.
 * The cache-control header is `no-store` because the assets are
 * rebuilt on input changes.
 */
function registerDevAssetRoutes(
  hono: Hono,
  config: ResolvedConfig,
  manifest: Manifest,
): void {
  hono.get(RUNTIME_PUBLIC_PATH, async (c) => {
    return await serveDevAsset(runtimeServeOptions(config, new URL(c.req.url)));
  });
  hono.get(RUNTIME_MAP_PUBLIC_PATH, async (_c) => {
    return await serveDevSourceMap(runtimeSourceMapOptions(config));
  });
  hono.get(APP_STYLESHEET_PUBLIC_PATH, async (c) => {
    if (manifest.styles.app === null) {
      throw new CoreError(
        "STATIC_FILE_NOT_FOUND",
        "no global stylesheet is configured",
        { publicPath: APP_STYLESHEET_PUBLIC_PATH },
      );
    }
    return await serveDevAsset({
      kind: "style",
      id: "app",
      entry: manifest.styles.app.file,
      publicPath: APP_STYLESHEET_PUBLIC_PATH,
      config,
      url: new URL(c.req.url),
    });
  });
  for (const island of manifest.islands) {
    const islandJsPath = island.publicPath;
    const islandMapPath = `${island.publicPath}.map` as const;
    hono.get(islandJsPath, async (c) => {
      return await serveDevAsset({
        kind: "island",
        id: island.id,
        entry: island.file,
        publicPath: islandJsPath,
        config,
        url: new URL(c.req.url),
      });
    });
    hono.get(islandMapPath, async (_c) => {
      return await serveDevSourceMap({
        kind: "island",
        id: island.id,
        entry: island.file,
        config,
      });
    });
  }
}

/**
 * Register the M7 production asset routes.
 *
 * The function:
 *
 *   1. Loads the frozen manifest at startup. A missing manifest
 *      is surfaced as `STATIC_FILE_NOT_FOUND` for any framework
 *      asset request; a separate `500` is also returned so the
 *      user understands the fix (run `sprout build`).
 *   2. Builds a per-process LRU keyed on public path. The LRU
 *      holds `{ bytes, gzipBytes }` pairs. The cache is opt-in:
 *      when `config.build.frozenAssetCache` is `"none"`, the
 *      LRU is `null` and every request reads from disk.
 *   3. Wires `GET /@sprout/runtime.js`, `GET /@sprout/app.css`,
 *      and `GET /@sprout/island/<id>.js` to a single
 *      `serveFrozenAsset` call. The 404 path is the typed
 *      `STATIC_FILE_NOT_FOUND` for public paths that are not in
 *      the manifest (e.g. an app.css was never compiled because
 *      no global stylesheet exists).
 *   4. Source maps are NOT served: the M6 production build does
 *      not emit `.map` files (M4 inlined them; M6 disables
 *      sourcemaps for production by default). A request for
 *      `/@sprout/runtime.js.map` therefore returns the Hono 404.
 */
async function registerProductionAssetRoutes(
  hono: Hono,
  config: ResolvedConfig,
): Promise<ProductionState> {
  // 1. Load the frozen index. A missing manifest is a startup
  // error; the manifest's own `FROZEN_MANIFEST_MISSING` is
  // wrapped in a `STATIC_FILE_NOT_FOUND` here so the typed
  // response surfaces a "run sprout build" hint without leaking
  // the internal error code to the wire.
  let frozenIndex: FrozenIndex;
  try {
    frozenIndex = await loadFrozenIndex(config.outDir);
  } catch (err) {
    if (err instanceof FrameworkError && err.code === "FROZEN_MANIFEST_MISSING") {
      const wrapped = new CoreError(
        "STATIC_FILE_NOT_FOUND",
        `production mode requires a built outDir; run \`sprout build\` first (${config.outDir})`,
        { outDir: config.outDir, cause: err.message },
      );
      // Surface a single 500 to any framework asset request.
      hono.get(RUNTIME_PUBLIC_PATH, () => coreErrorToResponse(wrapped));
      hono.get(APP_STYLESHEET_PUBLIC_PATH, () => coreErrorToResponse(wrapped));
      hono.get("/@sprout/island/:id{.+\\.js}", () => coreErrorToResponse(wrapped));
      // No LRU is built when the manifest is missing; the test
      // seam returns `null` and the app still serves routes.
      return { cache: { lru: null } };
    }
    throw err;
  }

  // 2. Build the LRU (or null). The cache is the only place that
  // holds asset bytes across requests; the spec is explicit
  // that the resident-memory cap is opt-in.
  const cache: ProdAssetCache = config.build.frozenAssetCache === "none" ? { lru: null } : {
    lru: new BoundedLru(
      config.build.frozenAssetCache.maxBytes,
    ),
  };

  // 3. Look up asset bytes through the LRU. On a hit the bytes
  // are returned without disk I/O; on a miss the helper reads
  // the manifest's on-disk file once and stores the result.
  // The LRU is keyed on the canonical public path; the byte
  // size reported to the cache is the sum of the raw + gzip
  // companion sizes so a hit count is consistent with the
  // configured cap.
  const lookup = async (
    publicPath: string,
  ): Promise<ReadFrozenAssetResult | null> => {
    if (!frozenIndex.assets.has(publicPath)) return null;
    if (cache.lru === null) {
      return await readFrozenAsset(frozenIndex, publicPath);
    }
    const cached = cache.lru.get(publicPath);
    if (cached !== undefined) {
      return {
        bytes: cached.bytes,
        contentType: frozenIndex.assets.get(publicPath)!.contentType,
        hash: frozenIndex.assets.get(publicPath)!.hash,
        gzipBytes: cached.gzipBytes,
      };
    }
    const result = await readFrozenAsset(frozenIndex, publicPath);
    const totalSize = result.bytes.byteLength +
      (result.gzipBytes?.byteLength ?? 0);
    cache.lru.set(
      publicPath,
      { bytes: result.bytes, gzipBytes: result.gzipBytes },
      totalSize,
    );
    return result;
  };

  // 4. Register the framework asset routes. Each route looks up
  // the asset through the closure-captured `frozenIndex` and
  // builds the typed response through `serveFrozenAsset`.
  hono.get(RUNTIME_PUBLIC_PATH, async (c) => {
    const preloaded = await lookup(RUNTIME_PUBLIC_PATH);
    if (preloaded === null) {
      return coreErrorToResponse(
        new CoreError(
          "STATIC_FILE_NOT_FOUND",
          `no frozen asset for ${RUNTIME_PUBLIC_PATH}`,
          { publicPath: RUNTIME_PUBLIC_PATH },
        ),
      );
    }
    return await serveFrozenAsset({
      frozenIndex,
      publicPath: RUNTIME_PUBLIC_PATH,
      request: c.req.raw,
      preloaded,
    });
  });

  hono.get(APP_STYLESHEET_PUBLIC_PATH, async (c) => {
    if (!frozenIndex.assets.has(APP_STYLESHEET_PUBLIC_PATH)) {
      return coreErrorToResponse(
        new CoreError(
          "STATIC_FILE_NOT_FOUND",
          "no global stylesheet is configured",
          { publicPath: APP_STYLESHEET_PUBLIC_PATH },
        ),
      );
    }
    const preloaded = await lookup(APP_STYLESHEET_PUBLIC_PATH);
    if (preloaded === null) {
      return coreErrorToResponse(
        new CoreError(
          "STATIC_FILE_NOT_FOUND",
          `no frozen asset for ${APP_STYLESHEET_PUBLIC_PATH}`,
          { publicPath: APP_STYLESHEET_PUBLIC_PATH },
        ),
      );
    }
    return await serveFrozenAsset({
      frozenIndex,
      publicPath: APP_STYLESHEET_PUBLIC_PATH,
      request: c.req.raw,
      preloaded,
    });
  });

  // 5. The island route is a single Hono dynamic route. The
  // manifest knows the canonical public paths; the route handler
  // resolves the asset on each request.
  hono.get("/@sprout/island/:id{.+\\.js}", async (c) => {
    const publicPath = `/@sprout/island/${c.req.param("id")}` as const;
    if (!frozenIndex.assets.has(publicPath)) {
      return coreErrorToResponse(
        new CoreError(
          "STATIC_FILE_NOT_FOUND",
          `no frozen asset for ${publicPath}`,
          { publicPath },
        ),
      );
    }
    const preloaded = await lookup(publicPath);
    if (preloaded === null) {
      return coreErrorToResponse(
        new CoreError(
          "STATIC_FILE_NOT_FOUND",
          `no frozen asset for ${publicPath}`,
          { publicPath },
        ),
      );
    }
    return await serveFrozenAsset({
      frozenIndex,
      publicPath,
      request: c.req.raw,
      preloaded,
    });
  });

  return { cache };
}

export async function createApp(options: CreateAppOptions = {}): Promise<App> {
  const config = await loadConfig({
    root: options.root,
    mode: options.mode,
    configFile: options.configFile,
  });
  return await buildApp(config);
}

export async function serve(options: ServeOptions = {}): Promise<void> {
  const config = await loadConfig({
    root: options.root,
    mode: options.mode,
    configFile: options.configFile,
  });
  const app = await buildApp(config);
  const hostname = options.hostname ?? config.server.hostname;
  const port = options.port ?? config.server.port;
  const server = Deno.serve({
    hostname,
    port,
    signal: options.signal,
    onListen: ({ hostname: h, port: p }) => {
      console.log(`[sprout] listening on http://${h}:${p}`);
    },
  }, (request) => app.fetch(request));
  await server.finished;
}

/**
 * Returns the underlying Hono instance for advanced consumers who need
 * to attach middleware, mount sub-apps, or read routing metadata.
 *
 * The Hono instance is not part of the public `App` type so Hono is
 * opt-in for consumers who do not need it. This function is the
 * supported escape hatch; the returned `AppAdvanced` type exposes the
 * `hono` field.
 */
export function getHono(app: App): AppAdvanced {
  return app as unknown as AppAdvanced;
}
