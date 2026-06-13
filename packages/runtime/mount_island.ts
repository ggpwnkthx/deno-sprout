// `mountIsland`: import a single island module and mount it into the
// supplied placeholder element.
//
// The runtime reads the three `data-sprout-*` attributes, validates
// the `src`, parses the props, dynamic-imports the module, calls the
// default export's `mount(element, props)`, and returns a structured
// result. On any failure the element is marked with
// `data-sprout-error="<CODE>"` and the function resolves (does not
// throw) with `ok: false`.
import { parseJsonProps, RuntimeError } from "@sprout/jsx/shared";
import type { IslandMountResult } from "./module_contract.ts";

const ISLAND_SRC_PREFIX = "/@sprout/island/";
const ISLAND_SRC_SUFFIX = ".js";
const ISLAND_SRC_PATTERN = /^\/@sprout\/island\/.+\.js$/;

/**
 * Dynamic importer shape. The default implementation uses the global
 * `import()`. Tests inject a fake to avoid the network.
 */
export type DynamicImporter = (specifier: string) => Promise<unknown>;

/**
 * Default importer. Wraps the global `import()` so tests can inject a
 * different implementation by passing `_import` to `mountIsland`.
 */
const defaultImporter: DynamicImporter = (specifier) =>
  // The `/* @vite-ignore */` comment is a hint for build tools that
  // see this string. Sprout does not require Vite; the comment is a
  // no-op for the Deno runtime.
  import(/* @vite-ignore */ specifier);

/**
 * Options accepted by `mountAll` and `mountIsland`. The single
 * `_import` field is intended for test injection; production code
 * should rely on the default global `import()`.
 */
export interface MountIslandOptions {
  /**
   * Inject a custom dynamic importer. Intended for tests; the default
   * uses the global `import()`. The importer receives the canonical
   * `src` URL verbatim.
   */
  readonly _import?: DynamicImporter;
}

/**
 * Validate the `data-sprout-src` attribute. Returns `null` on success
 * or a `RuntimeError` describing the failure. The error carries a
 * stable `code` so callers can map it to a UI marker.
 */
function validateIslandSrc(src: string | null, id: string): RuntimeError | null {
  if (src === null || src === undefined) {
    return new RuntimeError("INVALID_PLACEHOLDER", "missing data-sprout-src attribute", {
      id,
      src: null,
    });
  }
  if (typeof src !== "string") {
    return new RuntimeError("INVALID_PLACEHOLDER", "data-sprout-src must be a string", {
      id,
      src: String(src),
    });
  }
  if (src.includes("\0")) {
    return new RuntimeError("INVALID_PLACEHOLDER", "data-sprout-src contains a NUL byte", {
      id,
      src,
      reason: "nul_byte",
    });
  }
  if (!src.startsWith(ISLAND_SRC_PREFIX)) {
    return new RuntimeError(
      "INVALID_PLACEHOLDER",
      "data-sprout-src must start with /@sprout/island/",
      {
        id,
        src,
        reason: "missing_prefix",
      },
    );
  }
  if (!src.endsWith(ISLAND_SRC_SUFFIX)) {
    return new RuntimeError("INVALID_PLACEHOLDER", "data-sprout-src must end with .js", {
      id,
      src,
      reason: "missing_extension",
    });
  }
  if (!ISLAND_SRC_PATTERN.test(src)) {
    return new RuntimeError(
      "INVALID_PLACEHOLDER",
      "data-sprout-src is not a canonical /@sprout/island/<id>.js path",
      {
        id,
        src,
        reason: "bad_shape",
      },
    );
  }
  const tail = src.slice(ISLAND_SRC_PREFIX.length, -ISLAND_SRC_SUFFIX.length);
  for (const segment of tail.split("/")) {
    if (segment === "." || segment === "..") {
      return new RuntimeError(
        "INVALID_PLACEHOLDER",
        "data-sprout-src must not contain '.' or '..' path segments",
        {
          id,
          src,
          reason: "dot_segment",
        },
      );
    }
  }
  return null;
}

/**
 * Mount a single placeholder element. Always resolves with an
 * `IslandMountResult`; never throws.
 */
export async function mountIsland(
  element: HTMLElement,
  options: MountIslandOptions = {},
): Promise<IslandMountResult> {
  const id = element.getAttribute("data-sprout-island") ?? "";
  const src = element.getAttribute("data-sprout-src");
  const importer = options._import ?? defaultImporter;

  // 1. Validate the src. On failure, mark the element and resolve.
  const srcError = validateIslandSrc(src, id);
  if (srcError !== null) {
    element.setAttribute("data-sprout-error", "INVALID_PLACEHOLDER");
    return { ok: false, id, src: src ?? "", element, error: srcError };
  }
  const safeSrc = src as string;

  // 2. Parse props. Missing or empty attribute means `{}`. We use the
  //    literal "{}" as the empty case so a parser that fails on an
  //    empty input still succeeds for the common no-props island.
  const propsRaw = element.getAttribute("data-sprout-props");
  let props: Readonly<Record<string, unknown>>;
  try {
    props = propsRaw === null ? {} : parseJsonProps(propsRaw);
  } catch (cause) {
    const error = cause instanceof RuntimeError
      ? cause
      : new RuntimeError("INVALID_PROPS", "props must be a valid JSON object", {
        reason: "json_parse",
      });
    element.setAttribute("data-sprout-error", "INVALID_PROPS");
    return { ok: false, id, src: safeSrc, element, error };
  }

  // 3. Dynamic import the module. Catch any error (network, module
  //    not found, parse error) and report MOUNT_FAILED.
  let module: unknown;
  try {
    module = await importer(safeSrc);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    element.setAttribute("data-sprout-error", "MOUNT_FAILED");
    return {
      ok: false,
      id,
      src: safeSrc,
      element,
      error: new RuntimeError("MOUNT_FAILED", "island module not found", {
        id,
        src: safeSrc,
        cause: message,
      }),
    };
  }

  // 4. The module's default export must expose a callable `mount`.
  const candidate = (module as { default?: unknown }).default;
  const mountFn = (candidate as { mount?: unknown } | null | undefined)?.mount;
  if (typeof mountFn !== "function") {
    element.setAttribute("data-sprout-error", "MOUNT_FAILED");
    return {
      ok: false,
      id,
      src: safeSrc,
      element,
      error: new RuntimeError("MOUNT_FAILED", "island module is missing a mount function", {
        id,
        src: safeSrc,
      }),
    };
  }

  // 5. Invoke the mount function. Await any returned promise; wrap any
  //    throw as MOUNT_FAILED.
  try {
    const result = await mountFn.call(candidate, element, props);
    if (result !== undefined && typeof (result as { then?: unknown }).then === "function") {
      await result;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    element.setAttribute("data-sprout-error", "MOUNT_FAILED");
    return {
      ok: false,
      id,
      src: safeSrc,
      element,
      error: new RuntimeError("MOUNT_FAILED", `island mount threw: ${message}`, {
        id,
        src: safeSrc,
        cause: message,
      }),
    };
  }

  return { ok: true, id, src: safeSrc, element };
}
