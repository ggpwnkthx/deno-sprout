// bundler.ts - Production bundler
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

export interface BuildOptions {
  /** Project root. Default: Deno.cwd() */
  root?: string;
  /** Islands source directory relative to root. Default: "islands" */
  islandsDir?: string;
  /** Static files source directory relative to root. Default: "static" */
  staticDir?: string;
  /** Output directory relative to root. Default: "_dist" */
  outdir?: string;
  /** Whether to minify output. Default: true */
  minify?: boolean;
  /** Log progress to stdout. Default: true */
  verbose?: boolean;
}

export interface BuildResult {
  /** Paths of all written output files (relative to outdir). */
  outputFiles: string[];
  /** The generated manifest. */
  manifest: IslandManifest;
  /** Build duration in milliseconds. */
  durationMs: number;
}

/**
 * Full production build:
 *   1. Discover all islands in islandsDir
 *   2. For each island:
 *        a. Call `generateIslandWrapper(island.name)` to get the wrapper source text.
 *        b. Pass the wrapper source to `transpile({ source, name, minify, resolveDir })`.
 *        c. Content-hash each output
 *   3. Write to outdir/islands/
 *   4. Bundle lib/runtime.ts to outdir/hydrate.js
 *   5. Bundle lib/mount.ts to outdir/runtime/mount.js
 *   6. Copy static assets
 *   7. Write manifest.json
 *   8. Return BuildResult
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
 * Build the hydration runtime from packages/islands/lib/runtime.ts.
 * Output: {outdir}/hydrate.js (not content-hashed — always revalidated).
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

/** Strategy: "visible" — hydrate when element enters viewport */
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

/** Strategy: "idle" — hydrate during browser idle time */
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
 * Build the mount helper from packages/islands/lib/mount.ts.
 * Output: {outdir}/runtime/mount.js (not content-hashed — always revalidated).
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
 * Hono's JSX runtime is string-serialisation-first — it has no DOM reconciler.
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
  return () => {}; // dispose — no-op in 0.1.0
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
