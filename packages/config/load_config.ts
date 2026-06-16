// Config loader, resolver, and validator.
//
// `loadConfig` is the public entry point. It resolves the project root,
// decides whether a `sprout.config.ts` file exists, and either imports
// the file or starts from defaults. The imported module's default
// export is the config object; the default export is then fed into
// `resolveConfig`, which validates the shape and produces a
// `ResolvedConfig`.
//
// `resolveConfig` is exported separately so that tests (and future
// tooling) can validate a config object without touching the
// filesystem. `loadConfig` is a thin wrapper around `resolveConfig`
// that performs the import and the file existence check first.
import { isAbsolute, join, toFileUrl } from "@std/path";
import { isInsideRoot, slash } from "@sprout/utils";
import { ConfigError } from "./errors.ts";
import { DEFAULT_FROZEN_ASSET_CACHE_MAX_BYTES, DEFAULTS } from "./defaults.ts";
import type { ConfigInput, Mode, ResolvedConfig } from "./types.ts";

// ---------------------------------------------------------------------------
// Top-level key whitelist
// ---------------------------------------------------------------------------

/**
 * The closed set of top-level keys `ConfigInput` accepts. Anything else
 * is rejected with `CONFIG_INVALID_SHAPE` in strict mode (the M2
 * default).
 */
const ALLOWED_TOP_KEYS = new Set([
  "root",
  "srcDir",
  "publicDir",
  "outDir",
  "routes",
  "islands",
  "styles",
  "build",
  "server",
]);

/** Top-level keys allowed inside `ConfigInput.routes`. */
const ALLOWED_ROUTES_KEYS = new Set(["dir", "include", "exclude"]);

/** Top-level keys allowed inside `ConfigInput.islands`. */
const ALLOWED_ISLANDS_KEYS = new Set(["dir", "include", "exclude"]);

/** Top-level keys allowed inside `ConfigInput.styles`. */
const ALLOWED_STYLES_KEYS = new Set(["app"]);

/** Top-level keys allowed inside `ConfigInput.build`. */
const ALLOWED_BUILD_KEYS = new Set(["compress", "sourcemap", "minify", "frozenAssetCache"]);

/** Top-level keys allowed inside `ConfigInput.server`. */
const ALLOWED_SERVER_KEYS = new Set(["hostname", "port"]);

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve `value` to a slash-normalized absolute path inside `root`.
 * Throws `ConfigError` on a string containing a NUL byte, on a value
 * that escapes `root`, or on a value that is not a string.
 */
function resolveInsideRoot(
  value: unknown,
  root: string,
  field: string,
  allowFalse: boolean,
): string | null {
  if (value === false && allowFalse) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      `config field "${field}" must be a string`,
      { field },
    );
  }
  if (value.includes("\0")) {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      `config field "${field}" contains a NUL byte`,
      { field, path: value },
    );
  }
  const absolute = isAbsolute(value) ? slash(value) : slash(join(root, value));
  if (!isInsideRoot(absolute, root)) {
    throw new ConfigError(
      "CONFIG_PATH_OUTSIDE_ROOT",
      `config field "${field}" escapes project root`,
      { field, path: absolute, root },
    );
  }
  return absolute;
}

// ---------------------------------------------------------------------------
// Field validation helpers
// ---------------------------------------------------------------------------

/** Assert `value` is a non-empty string. */
function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ConfigError(
      "CONFIG_INVALID_SHAPE",
      `config field "${field}" must be a non-empty string`,
      { field },
    );
  }
  return value;
}

/**
 * Validate a port number. Throws `ConfigError("CONFIG_INVALID_PORT", ...)`
 * if the value is not an integer in `[1, 65535]`.
 */
function requirePort(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(
      "CONFIG_INVALID_PORT",
      `config field "${field}" must be an integer in [1, 65535]`,
      { field, value: String(value) },
    );
  }
  return value;
}

/** Validate an `include`/`exclude` glob list: non-empty strings only. */
function requireGlobList(
  value: unknown,
  field: string,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(
      "CONFIG_INVALID_SHAPE",
      `config field "${field}" must be a non-empty array of glob patterns`,
      { field },
    );
  }
  for (let i = 0; i < value.length; i++) {
    const entry = value[i];
    if (typeof entry !== "string" || entry.length === 0) {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `config field "${field}[${i}]" must be a non-empty string`,
        { field, index: i },
      );
    }
  }
  return value as readonly string[];
}

/** Reject unknown keys inside a nested config object. */
function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  parent: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `unknown config key "${parent}.${key}"`,
        { key, parent },
      );
    }
  }
}

/** Ensure `value` is a plain object record (not null, not an array). */
function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigError(
      "CONFIG_INVALID_SHAPE",
      `config field "${field}" must be a plain object`,
      { field, actual: value === null ? "null" : Array.isArray(value) ? "array" : typeof value },
    );
  }
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------

/**
 * Validate a `ConfigInput` against the schema and produce a fully
 * resolved `ResolvedConfig`.
 *
 * The function is pure: it does not read the filesystem (other than to
 * check the optional `styles.app` stylesheet) and does not import any
 * user code. `loadConfig` is the file-aware wrapper that calls this
 * after the import.
 *
 * @param input The raw config object exported by `sprout.config.ts`.
 * @param options The resolution context: project root and run mode.
 */
export function resolveConfig(
  input: unknown,
  options: { readonly root: string; readonly mode: Mode },
): ResolvedConfig {
  const root = slash(options.root);
  if (root.length === 0) {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      "project root must be a non-empty absolute path",
      { root },
    );
  }
  if (!root.startsWith("/")) {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      "project root must be an absolute path",
      { root },
    );
  }
  const rootAbs = root;

  // Top-level shape: a plain object only.
  const top = requireObject(input, "config");

  // Unknown top-level keys are rejected in strict mode (M2 default).
  for (const key of Object.keys(top)) {
    if (!ALLOWED_TOP_KEYS.has(key)) {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `unknown top-level config key "${key}"`,
        { key },
      );
    }
  }

  // -----------------------------------------------------------------------
  // String-valued path fields
  // -----------------------------------------------------------------------
  const srcDir = resolveInsideRoot(
    top.srcDir ?? DEFAULTS.srcDir,
    rootAbs,
    "srcDir",
    false,
  ) as string;
  const outDir = resolveInsideRoot(
    top.outDir ?? DEFAULTS.outDir,
    rootAbs,
    "outDir",
    false,
  ) as string;

  // publicDir is either a string or `false`. `false` resolves to `null`.
  const publicDirRaw = top.publicDir === undefined ? DEFAULTS.publicDir : top.publicDir;
  const publicDir = publicDirRaw === false
    ? null
    : resolveInsideRoot(publicDirRaw, rootAbs, "publicDir", true) as string | null;

  // -----------------------------------------------------------------------
  // routes / islands discovery
  // -----------------------------------------------------------------------
  const routesInput = top.routes === undefined
    ? {} as Record<string, unknown>
    : requireObject(top.routes, "routes");
  rejectUnknownKeys(routesInput, ALLOWED_ROUTES_KEYS, "routes");
  const routesDir = resolveInsideRoot(
    routesInput.dir ?? DEFAULTS.routes.dir,
    rootAbs,
    "routes.dir",
    false,
  ) as string;
  const routesInclude = requireGlobList(
    routesInput.include ?? DEFAULTS.routes.include,
    "routes.include",
  );
  const routesExclude = requireGlobList(
    routesInput.exclude ?? DEFAULTS.routes.exclude,
    "routes.exclude",
  );

  const islandsInput = top.islands === undefined
    ? {} as Record<string, unknown>
    : requireObject(top.islands, "islands");
  rejectUnknownKeys(islandsInput, ALLOWED_ISLANDS_KEYS, "islands");
  const islandsDir = resolveInsideRoot(
    islandsInput.dir ?? DEFAULTS.islands.dir,
    rootAbs,
    "islands.dir",
    false,
  ) as string;
  const islandsInclude = requireGlobList(
    islandsInput.include ?? DEFAULTS.islands.include,
    "islands.include",
  );
  const islandsExclude = requireGlobList(
    islandsInput.exclude ?? DEFAULTS.islands.exclude,
    "islands.exclude",
  );

  // -----------------------------------------------------------------------
  // styles
  // -----------------------------------------------------------------------
  const stylesInput = top.styles === undefined
    ? {} as Record<string, unknown>
    : requireObject(top.styles, "styles");
  rejectUnknownKeys(stylesInput, ALLOWED_STYLES_KEYS, "styles");
  let stylesApp: string | null;
  if (stylesInput.app === false) {
    stylesApp = null;
  } else if (typeof stylesInput.app === "string") {
    const resolved = resolveInsideRoot(
      stylesInput.app,
      rootAbs,
      "styles.app",
      false,
    ) as string;
    // Disk check: if the file does not exist, warn and set to null.
    let exists = false;
    try {
      const stat = Deno.statSync(resolved);
      exists = stat.isFile;
    } catch (_cause) {
      exists = false;
    }
    if (exists) {
      stylesApp = resolved;
    } else {
      console.warn(
        `[sprout] config styles.app ${JSON.stringify(resolved)} does not exist; setting to null`,
      );
      stylesApp = null;
    }
  } else if (stylesInput.app === undefined) {
    // Default: look at <root>/src/styles/app.css.
    const candidate = slash(join(rootAbs, "src/styles/app.css"));
    let exists = false;
    try {
      const stat = Deno.statSync(candidate);
      exists = stat.isFile;
    } catch (_cause) {
      exists = false;
    }
    stylesApp = exists ? candidate : null;
  } else {
    throw new ConfigError(
      "CONFIG_INVALID_SHAPE",
      `config field "styles.app" must be a string or false`,
      { actual: typeof stylesInput.app },
    );
  }

  // -----------------------------------------------------------------------
  // build
  // -----------------------------------------------------------------------
  const buildInput = top.build === undefined
    ? {} as Record<string, unknown>
    : requireObject(top.build, "build");
  rejectUnknownKeys(buildInput, ALLOWED_BUILD_KEYS, "build");

  let compress: false | "gzip";
  if (buildInput.compress === undefined) {
    compress = DEFAULTS.build.compress;
  } else if (buildInput.compress === false || buildInput.compress === "gzip") {
    compress = buildInput.compress;
  } else {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      `config field "build.compress" must be false or "gzip"`,
      { actual: String(buildInput.compress) },
    );
  }

  // Mode-driven defaults for sourcemap and minify.
  const sourcemap = buildInput.sourcemap === undefined ? (options.mode === "development") : (() => {
    if (typeof buildInput.sourcemap !== "boolean") {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `config field "build.sourcemap" must be a boolean`,
        { actual: typeof buildInput.sourcemap },
      );
    }
    return buildInput.sourcemap;
  })();

  const minify = buildInput.minify === undefined ? (options.mode === "production") : (() => {
    if (typeof buildInput.minify !== "boolean") {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `config field "build.minify" must be a boolean`,
        { actual: typeof buildInput.minify },
      );
    }
    return buildInput.minify;
  })();

  // frozenAssetCache: "none" or a "bounded" object with a positive integer maxBytes.
  let frozenAssetCache:
    | "none"
    | { readonly kind: "bounded"; readonly maxBytes: number };
  if (buildInput.frozenAssetCache === undefined) {
    frozenAssetCache = "none";
  } else if (buildInput.frozenAssetCache === "none") {
    frozenAssetCache = "none";
  } else {
    const cache = requireObject(buildInput.frozenAssetCache, "build.frozenAssetCache");
    if (cache.kind !== "bounded") {
      throw new ConfigError(
        "CONFIG_INVALID_CACHE_POLICY",
        `config field "build.frozenAssetCache.kind" must be "bounded"`,
        { actual: String(cache.kind) },
      );
    }
    let maxBytes: number;
    if (cache.maxBytes === undefined) {
      maxBytes = DEFAULT_FROZEN_ASSET_CACHE_MAX_BYTES;
    } else if (
      typeof cache.maxBytes === "number" &&
      Number.isInteger(cache.maxBytes) &&
      cache.maxBytes > 0
    ) {
      maxBytes = cache.maxBytes;
    } else {
      throw new ConfigError(
        "CONFIG_INVALID_CACHE_POLICY",
        `config field "build.frozenAssetCache.maxBytes" must be a positive integer`,
        { actual: String(cache.maxBytes) },
      );
    }
    frozenAssetCache = { kind: "bounded", maxBytes };
  }

  // -----------------------------------------------------------------------
  // server
  // -----------------------------------------------------------------------
  const serverInput = top.server === undefined
    ? {} as Record<string, unknown>
    : requireObject(top.server, "server");
  rejectUnknownKeys(serverInput, ALLOWED_SERVER_KEYS, "server");
  const hostname = serverInput.hostname === undefined
    ? DEFAULTS.server.hostname
    : requireNonEmptyString(serverInput.hostname, "server.hostname");
  const port = serverInput.port === undefined
    ? DEFAULTS.server.port
    : requirePort(serverInput.port, "server.port");

  return {
    mode: options.mode,
    root: rootAbs,
    srcDir,
    publicDir,
    outDir,
    routes: {
      dir: routesDir,
      include: routesInclude,
      exclude: routesExclude,
    },
    islands: {
      dir: islandsDir,
      include: islandsInclude,
      exclude: islandsExclude,
    },
    styles: { app: stylesApp },
    build: { compress, sourcemap, minify, frozenAssetCache },
    server: { hostname, port },
  };
}

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

export type LoadConfigOptions = {
  /** Project root. Defaults to `Deno.cwd()`. */
  readonly root?: string;
  /** Run mode. Defaults to `"development"`. */
  readonly mode?: Mode;
  /**
   * Path to the config file. Defaults to `<root>/sprout.config.ts`.
   * A missing file at this path causes the loader to use defaults.
   */
  readonly configFile?: string;
};

/**
 * Load and validate the project configuration.
 *
 * Resolves the root, checks for a `sprout.config.ts` file, and either
 * imports the file (via dynamic `import()`) or starts from defaults.
 * The import is wrapped: any thrown error is rethrown as
 * `ConfigError("CONFIG_IMPORT_FAILED", ..., { path, cause })` so that
 * callers only need to catch the typed error.
 *
 * The function never creates files and never starts an HTTP server.
 */
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<ResolvedConfig> {
  const root = slash(options.root ?? Deno.cwd());
  if (!root.startsWith("/")) {
    throw new ConfigError(
      "CONFIG_INVALID_PATH",
      "project root must be an absolute path",
      { root },
    );
  }
  const mode: Mode = options.mode ?? "development";
  const configFile = slash(options.configFile ?? join(root, "sprout.config.ts"));

  let input: ConfigInput = {};
  let fileExists = false;
  try {
    const stat = Deno.statSync(configFile);
    fileExists = stat.isFile;
  } catch (_cause) {
    fileExists = false;
  }

  if (fileExists) {
    const fileUrl = toFileUrl(configFile).href;
    let mod: Record<string, unknown>;
    try {
      mod = await import(fileUrl) as Record<string, unknown>;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ConfigError(
        "CONFIG_IMPORT_FAILED",
        `failed to import config file ${configFile}`,
        { path: configFile, cause: message },
      );
    }
    if (!("default" in mod)) {
      throw new ConfigError(
        "CONFIG_IMPORT_FAILED",
        `config file ${configFile} has no default export`,
        { path: configFile },
      );
    }
    input = mod.default as ConfigInput;
    // `mod` may carry the `defineConfig` named import re-exported by
    // the user's config file; we ignore all named exports and only
    // validate the default. This lets the canonical
    // `import { defineConfig } from "@sprout/config"` pattern work
    // without the loader treating the re-export as an error.
  }

  return resolveConfig(input, { root, mode });
}

// Re-export `FrameworkError` so consumers who reach this package via
// `load_config.ts` do not need a second import from `@sprout/utils`.
// This is the only reason `FrameworkError` is exposed from this
// module — `loadConfig` and `resolveConfig` do not use it directly.
// Other packages should import it from `@sprout/utils`.
export { FrameworkError } from "@sprout/utils";
