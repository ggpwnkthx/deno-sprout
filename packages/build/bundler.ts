// bundler.ts - Production bundler
/**
 * @ggpwnkthx/sprout-build – Production build and bundling for Sprout.
 *
 * ## Overview
 *
 * This package orchestrates the full production build for a Sprout application:
 * - Discovers interactive island components from the `islands/` directory.
 * - Transpiles and bundles each island using esbuild, wrapping them with the
 *   island runtime contract.
 * - Emits a content-hashed island bundle per entry point (enabling long-term
 * caching).
 * - Writes the shared hydration runtime (`hydrate.js`) and mount helper
 *   (`runtime/mount.js`), both kept unhashed so they are always revalidated.
 * - Copies static assets verbatim into `_dist/static/`.
 * - Produces a machine-readable `manifest.json` that maps island names to their
 *   hashed bundle URLs.
 *
 * ## Build output layout
 *
 * ```
 * _dist/
 *   islands/
 *     Counter.ab1c2d3e.js   ← content-hashed island bundle
 *     Timer.f5e6d7c8b.js
 *   static/
 *     …files copied verbatim…
 *   runtime/
 *     mount.js              ← always revalidated, never hashed
 *   hydrate.js              ← always revalidated, never hashed
 *   manifest.json
 * ```
 *
 * ## Relationship to other sprout packages
 *
 * - **@ggpwnkthx/sprout-islands** provides the `generateIslandWrapper()` template
 *   used here to wrap every island bundle.
 * - **@ggpwnkthx/sprout-core** consumes the generated `manifest.json` at runtime
 *   to resolve island bundle URLs and register FS routes.
 * - **@ggpwnkthx/sprout-dev** runs a development server that sidesteps this
 *   package entirely; islands are served unminified and without hashes in dev.
 *
 * @module
 */
import {
  copyStaticAssets,
  discoverIslands,
  writeIslandBundle,
} from "./lib/assets.ts";
import { transpile } from "./lib/esbuild.ts";
import {
  buildManifest,
  contentHash,
  type IslandManifest,
  writeManifest,
} from "./manifest.ts";
import { generateIslandWrapper } from "@ggpwnkthx/sprout-islands/lib/wrapper-template";
import { join } from "@std/path";

/**
 * Options that control the behaviour of {@link buildIslands}.
 *
 * @example
 * ```ts
 * await buildIslands({
 *   root: Deno.cwd(),
 *   islandsDir: "islands",
 *   staticDir: "static",
 *   outdir: "_dist",
 *   minify: true,
 *   verbose: true,
 * });
 * ```
 */
export interface BuildOptions {
  /**
   * The project root directory. All other paths are resolved relative to this.
   * Defaults to `Deno.cwd()` when omitted.
   */
  root?: string;
  /**
   * Directory containing island `.ts` / `.tsx` source files, resolved relative
   * to `root`. Defaults to `"islands"`.
   */
  islandsDir?: string;
  /**
   * Directory containing static assets to copy verbatim into `_dist/static/`,
   * resolved relative to `root`. Defaults to `"static"`. May be absent; the
   * build skips this step gracefully if the directory does not exist.
   */
  staticDir?: string;
  /**
   * Output directory for all build artefacts, resolved relative to `root`.
   * Defaults to `"_dist"`. Accepts both absolute paths and relative paths.
   */
  outdir?: string;
  /**
   * Whether to minify the generated island bundles with esbuild.
   * Defaults to `true`. Set to `false` when debugging islands.
   */
  minify?: boolean;
  /**
   * When `true`, progress messages are written to `stdout` prefixed with
   * `"[build]"`. Defaults to `true`.
   */
  verbose?: boolean;
}

/**
 * Result of a successful {@link buildIslands} invocation.
 */
export interface BuildResult {
  /**
   * An ordered list of all files written to `outdir`, expressed as relative
   * paths from `outdir`. Example:
   * ```json
   * [
   *   "islands/Counter.ab1c2d3e.js",
   *   "islands/Timer.f5e6d7c8b.js",
   *   "hydrate.js",
   *   "runtime/mount.js",
   *   "manifest.json"
   * ]
   * ```
   * **Static files are not listed here** because the number of files is
   * variable; use {@link BuildOptions.staticDir} / the `static/` directory
   * directly to enumerate them if needed.
   */
  outputFiles: string[];
  /**
   * The generated {@link IslandManifest}, already written to
   * `{outdir}/manifest.json`.
   */
  manifest: IslandManifest;
  /**
   * Wall-clock elapsed time for the entire {@link buildIslands} call, in
   * integer milliseconds.
   */
  durationMs: number;
}

/**
 * Run the full production build for all islands in a project.
 *
 * ## What happens (in order)
 *
 * 1. **Discovery** – walk `islandsDir` (default: `islands/`) recursively and
 *    collect every `.ts` / `.tsx` file. Each file corresponds to one island; its
 *    base name (e.g. `Counter` from `Counter.tsx`) is the island identifier used
 *    throughout the build and at runtime.
 *
 * 2. **Per-island transpilation** – for each discovered island:
 *    a. Obtain the wrapper source from
 *       {@link https://jsr.io/@ggpwnkthx/sprout-islands `@ggpwnkthx/sprout-islands`}'s
 *       `generateIslandWrapper(island.name)`. The wrapper injects the island's
 *       exported component into the page shell and sets up the `data-island`
 *       attribute contract.
 *    b. Run the wrapper source through esbuild with `bundle: true`, JSX set to
 *       `automatic` with `jsxImportSource: "@hono/hono"`, and all relative
 *       imports resolved from `islandsDir`. This produces a single self-contained
 *       ESM bundle with Hono JSX calls inlined.
 *    c. Content-hash the bundle bytes (first 8 hex chars of SHA-256) and write
 *       the bundle to `_dist/islands/{Name}.{hash}.js`.
 *
 * 3. **Runtime bundles** – two always-unhashed files are written so browsers
 *    revalidate them on every request (enabling server-side cache-control
 *    strategies that rely on stable URLs):
 *    - `hydrate.js` – the island hydration entry point. Reads all
 *      `[data-island]` elements, respects `data-strategy` (`"immediate"`,
 *      `"visible"`, `"idle"`), fetches the appropriate island bundle, decodes
 *      the `data-props` attribute, and calls the island's default export.
 *    - `runtime/mount.js` – a helper used by islands that need server-side
 *      rendering of their initial HTML (via `renderToString` from
 *      `@hono/hono/jsx/dom/server`).
 *
 * 4. **Static assets** – every file under `staticDir` is copied verbatim into
 *    `_dist/static/`, preserving directory structure.
 *
 * 5. **Manifest** – an {@link IslandManifest} is serialised to
 *    `{outdir}/manifest.json`. It maps each island name to its content-hashed
 *    bundle URL and records the `hydrate.js` path.
 *
 * ## Example
 *
 * ```ts
 * import { buildIslands } from "@ggpwnkthx/sprout-build";
 *
 * const result = await buildIslands({ verbose: true });
 * console.log(`Done in ${result.durationMs}ms`);
 * console.log(result.outputFiles);
 * console.log(result.manifest);
 * ```
 *
 * @param options – optional {@link BuildOptions}. All fields are optional and
 *   have sensible defaults.
 * @returns A {@link BuildResult} containing the list of written files, the
 *   generated manifest, and wall-clock elapsed time.
 */
export async function buildIslands(
  options?: BuildOptions,
): Promise<BuildResult> {
  const start = Date.now();
  const root = options?.root ?? Deno.cwd();
  const islandsDir = join(root, options?.islandsDir ?? "islands");
  const staticDir = join(root, options?.staticDir ?? "static");
  // If outdir is absolute, use it directly; otherwise join with root
  const outdir = options?.outdir
    ? (options.outdir.startsWith("/") || options.outdir.match(/^[a-zA-Z]:/))
      ? options.outdir
      : join(root, options.outdir)
    : join(root, "_dist");
  const minify = options?.minify ?? true;
  const verbose = options?.verbose ?? true;

  const log = (msg: string) => {
    if (verbose) console.log(`[build] ${msg}`);
  };

  const outputFiles: string[] = [];

  // 1. Discover islands
  log(`Discovering islands in ${islandsDir}`);
  const islands = await discoverIslands(islandsDir);
  log(`Found ${islands.length} island(s)`);

  // 2. Build each island
  const islandCodeMap: Record<string, string> = {};

  for (const island of islands) {
    log(`Building island: ${island.name}`);

    // a. Generate wrapper source
    const wrapperSource = generateIslandWrapper(island.name);

    // b. Transpile with esbuild (bundle mode with resolveDir for relative imports)
    const result = await transpile({
      source: wrapperSource,
      name: island.name,
      minify,
      resolveDir: islandsDir,
    });

    if (result.warnings.length > 0) {
      console.warn(`[build] Warnings for ${island.name}:`, result.warnings);
    }

    // c. Content-hash the output
    const encoder = new TextEncoder();
    const bytes = encoder.encode(result.code);
    const hash = await contentHash(bytes);

    // Write to outdir/islands/{name}.{hash}.js
    await writeIslandBundle(island.name, result.code, hash, outdir);
    outputFiles.push(`islands/${island.name}.${hash}.js`);

    // Store for manifest
    islandCodeMap[island.name] = result.code;
  }

  // 4. Build runtime: hydrate.js and runtime/mount.js
  await buildRuntime(outdir);
  outputFiles.push("hydrate.js");
  await buildMount(outdir);
  outputFiles.push("runtime/mount.js");

  // 6. Copy static assets
  await copyStaticAssets(staticDir, outdir);
  log("Copied static assets");

  // 7. Write manifest.json
  const manifest = await buildManifest(islandCodeMap);
  await writeManifest(manifest, outdir);
  outputFiles.push("manifest.json");

  const durationMs = Date.now() - start;
  log(`Build complete in ${durationMs}ms`);

  return { outputFiles, manifest, durationMs };
}

/**
 * Write the island hydration runtime to `{outdir}/hydrate.js`.
 *
 * The hydration runtime is intentionally **not** content-hashed:
 * - It is a small, stable contract that changes rarely.
 * - Keeping its URL fixed allows aggressive `Cache-Control` policies on the
 *   server while still enabling island bundle hashes to be updated independently.
 *
 * The generated file exports the public `hydrateAll()` async function which is
 * called once by the page shell after `DOMContentLoaded`. It:
 * - Queries all `[data-island]` elements.
 * - Reads `data-strategy` (`"immediate"`, `"visible"`, `"idle"`) per element.
 * - Fetches the corresponding island bundle from `/_sprout/islands/{name}.js`.
 * - Decodes the `data-props` attribute (base64 → Uint8Array → JSON).
 * - Calls the island's default export as `default(props, containerElement)`.
 *
 * @param outdir – output directory resolved as in {@link BuildOptions.outdir}
 * @see {@link https://jsr.io/@ggpwnkthx/sprout-islands `@ggpwnkthx/sprout-islands`}
 *   for the island wrapper contract.
 */
export async function buildRuntime(outdir: string): Promise<void> {
  // Read the runtime source from the islands package
  const runtimeSource = `
// lib/runtime.ts
// This file runs in the browser. Keep it small.

/** Map from island name to its loaded module. Populated lazily. */
const loaded = new Map<
  string,
  { default: (props: unknown, el: Element) => void }
>();

/**
 * Decode and parse the data-props attribute.
 */
function decodeProps(encoded: string): unknown {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Fetch the island bundle from /_sprout/islands/{name}.js,
 * call module.default(props, containerElement).
 */
async function hydrateOne(el: Element): Promise<void> {
  const name = el.getAttribute("data-island");
  const propsEncoded = el.getAttribute("data-props");
  if (!name || !propsEncoded) return;

  let module: { default: (props: unknown, el: Element) => void };
  if (loaded.has(name)) {
    module = loaded.get(name)!;
  } else {
    const url = \`/_\sprout/islands/\${name}.js\`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(\`[sprout] Failed to fetch island bundle: \${url}\`);
      return;
    }
    const { default: mod } = await import(/* @vite-ignore */ url);
    module = { default: mod };
    loaded.set(name, module);
  }

  const props = decodeProps(propsEncoded);
  await module.default(props, el);
}

/** Strategy: "immediate" */
async function hydrateImmediate(el: Element): Promise<void> {
  await hydrateOne(el);
}

/** Strategy: "visible" - hydrate when element enters viewport */
async function hydrateVisible(el: Element): Promise<void> {
  await new Promise<void>((resolve) => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          hydrateOne(el).then(resolve).catch(() => resolve());
          break;
        }
      }
    });
    observer.observe(el);
  });
}

/** Strategy: "idle" - hydrate during browser idle time */
async function hydrateIdle(el: Element): Promise<void> {
  await new Promise<void>((resolve) => {
    const cb = () => {
      (idleCallback as { disconnect?: () => void })?.disconnect?.();
      hydrateOne(el).then(resolve).catch(() => resolve());
    };
    const rid = (window as typeof window & {
      requestIdleCallback: (cb: () => void) => number;
    }).requestIdleCallback;
    const idleCallback = rid ? rid(cb) : setTimeout(cb, 0);
  });
}

/**
 * Entry point. Called once after DOMContentLoaded.
 * Respects data-strategy for each island.
 */
export async function hydrateAll(): Promise<void> {
  const islands = document.querySelectorAll<Element>("[data-island]");
  const strategies = Array.from(islands).map((el) => {
    const strategy = (el.getAttribute("data-strategy") ?? "immediate") as
      | "immediate"
      | "visible"
      | "idle";
    switch (strategy) {
      case "visible":
        return hydrateVisible(el);
      case "idle":
        return hydrateIdle(el);
      default:
        return hydrateImmediate(el);
    }
  });
  await Promise.all(strategies);
}
`;

  const result = await transpile({
    source: runtimeSource,
    name: "runtime",
    minify: false, // runtime is not content-hashed, don't minify
  });

  await ensureDir(join(outdir));
  await Deno.writeFile(
    join(outdir, "hydrate.js"),
    new TextEncoder().encode(result.code),
  );
}

/**
 * Write the island mount helper to `{outdir}/runtime/mount.js`.
 *
 * The mount helper is intentionally **not** content-hashed (same reasoning as
 * {@link buildRuntime}). It is loaded by island bundles that require server-side
 * rendering of their initial HTML.
 *
 * The generated file exports an async `mount(Component, props, el)` function that:
 * 1. Calls `Component(props)` to produce a Hono JSX node.
 * 2. Serialises it to an HTML string via `renderToString` from
 *    `@hono/hono/jsx/dom/server`.
 * 3. Sets `el.innerHTML` once.
 * 4. Returns a no-op dispose function (reserved for future cleanup of
 *    component-registered effects).
 *
 * > **Note on the rendering model (v0.1.0):** Hono's JSX runtime is
 * > string-serialisation-first with no DOM reconciler. Island components that
 * > need reactivity must manage DOM mutations imperatively via `useEffect` +
 * > direct DOM calls. Signal-driven incremental updates are a Phase 5 item.
 *
 * @param outdir – output directory resolved as in {@link BuildOptions.outdir}
 */
export async function buildMount(outdir: string): Promise<void> {
  const mountSource = `
// lib/mount.ts
// This file runs in the BROWSER. No Deno APIs. No Node APIs.
// Imports must be bundled by sprout-build / sprout-dev.

/// <reference lib="dom" />
import { renderToString } from "@hono/hono/jsx/dom/server";
import type { FC } from "@hono/hono/jsx";

/**
 * Render a JSX island component into a DOM element using innerHTML.
 *
 * ## Rendering model (0.1.0)
 *
 * Hono's JSX runtime is string-serialisation-first - it has no DOM reconciler.
 * For 0.1.0, island hydration therefore uses a **full innerHTML replacement**:
 *   1. Call \`Component(props)\` to get a JSX node.
 *   2. Serialise to an HTML string via \`renderToString\`.
 *   3. Set \`el.innerHTML\` once.
 *
 * Signal-driven incremental DOM updates are **not automatic** in 0.1.0.
 * Island components that need reactivity must manage DOM mutations directly via
 * \`useEffect\` + \`el.querySelector(…).textContent = …\` or equivalent imperative
 * DOM calls. A real incremental renderer is a Phase 5 item.
 *
 * @param Component  The island's JSX functional component.
 * @param props      Deserialised props from the \`data-props\` attribute.
 * @param el         The container element (\`[data-island]\` div).
 * @returns          A dispose function. Currently a no-op; reserved for future
 *                   cleanup of effects registered by the component.
 */
export async function mount<P extends Record<string, unknown>>(
  Component: FC<P>,
  props: P,
  el: Element,
): Promise<() => void> {
  try {
    const html = await renderToString(Component(props));
    el.innerHTML = html;
  } catch (err) {
    console.error("[sprout] Failed to hydrate island:", err);
  }
  return () => {}; // dispose - no-op in 0.1.0
}
`;

  const runtimeDir = join(outdir, "runtime");
  await ensureDir(runtimeDir);

  const result = await transpile({
    source: mountSource,
    name: "mount",
    minify: false, // mount is not content-hashed
  });

  await Deno.writeFile(
    join(runtimeDir, "mount.js"),
    new TextEncoder().encode(result.code),
  );
}

// Helper to ensure directory exists
async function ensureDir(dir: string): Promise<void> {
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err instanceof Deno.errors.AlreadyExists) {
      // OK
    } else {
      throw err;
    }
  }
}
