// Pure config resolver and its validation helpers.
//
// `resolveConfig` validates a `ConfigInput` against the schema and produces
// a fully resolved `ResolvedConfig`. It contains no filesystem or network
// I/O — only in-memory validation and path resolution logic.
//
// `loadConfig` (in `load_config.ts`) is the file-aware wrapper that
// performs the dynamic `import()` of the user's `sprout.config.ts` and
// then delegates to this function for schema validation.
import { isAbsolute, join } from "@std/path";
import { isInsideRoot, slash } from "@sprout/utils";
import { ConfigError } from "./errors.ts";
import {
  DEFAULT_FROZEN_ASSET_CACHE_MAX_BYTES,
  DEFAULTS,
  MODE_DRIVEN_BUILD_DEFAULTS,
} from "./defaults.ts";
import type { ConfigInput, DiscoveryConfig, Mode, ResolvedConfig } from "./types.ts";

// ---------------------------------------------------------------------------
// Top-level key whitelist
// ---------------------------------------------------------------------------

/**
 * The closed set of top-level keys `ConfigInput` accepts. Anything else
 * is rejected with `CONFIG_INVALID_SHAPE` in strict mode (the M2
 * default).
 *
 * The set is derived from `keyof ConfigInput` so adding a new field to
 * `ConfigInput` automatically extends the validator's whitelist.
 */
const ALLOWED_TOP_KEYS: ReadonlySet<keyof ConfigInput> = new Set<keyof ConfigInput>([
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

/** Top-level keys allowed inside any discovery config (`routes`, `islands`). */
const ALLOWED_DISCOVERY_KEYS = new Set(["dir", "include", "exclude"]);

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

/**
 * Validate a hostname / IP bind address. Throws
 * `ConfigError("CONFIG_INVALID_HOSTNAME", ...)` on any failure.
 * Accepted forms: IPv4, bracketed IPv6, DNS hostname (with at least one
 * dot), or the literal word `localhost`.
 */
function requireHostname(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ConfigError(
      "CONFIG_INVALID_HOSTNAME",
      `config field "${field}" must be a valid IPv4 address, bracketed IPv6 address, or DNS hostname`,
      { field, value: String(value) },
    );
  }
  if (value.length === 0) {
    throw new ConfigError(
      "CONFIG_INVALID_HOSTNAME",
      `config field "${field}" must be a valid IPv4 address, bracketed IPv6 address, or DNS hostname`,
      { field, value },
    );
  }
  if (value.length > 253) {
    throw new ConfigError(
      "CONFIG_INVALID_HOSTNAME",
      `config field "${field}" must be a valid IPv4 address, bracketed IPv6 address, or DNS hostname`,
      { field, value },
    );
  }
  if (value !== value.trim()) {
    throw new ConfigError(
      "CONFIG_INVALID_HOSTNAME",
      `config field "${field}" must be a valid IPv4 address, bracketed IPv6 address, or DNS hostname`,
      { field, value },
    );
  }
  // Reject control characters (including NUL).
  for (let i = 0; i < value.length; i++) {
    const cp = value.charCodeAt(i);
    if (cp <= 0x1f || cp === 0x7f) {
      throw new ConfigError(
        "CONFIG_INVALID_HOSTNAME",
        `config field "${field}" contains a control character`,
        { field, value },
      );
    }
  }

  // ---- Format checks (first match wins) ----

  // IPv4: each octet 0-255.
  if (
    /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value)
  ) {
    return value;
  }

  // Bracketed IPv6: [::1], [::ffff:127.0.0.1], etc.
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1);
    if (
      inner.length >= 2 &&
      inner.length <= 46 &&
      /^[0-9a-fA-F:.]+$/.test(inner) &&
      inner.includes(":")
    ) {
      return value;
    }
  }

  // Hostname: must contain at least one dot (localhost handled separately).
  if (value.includes(".")) {
    const labels = value.split(".");
    if (
      labels.every((label) => {
        const len = label.length;
        return len >= 1 && len <= 63 &&
          /^[a-zA-Z0-9]/.test(label) &&
          /[a-zA-Z0-9]$/.test(label) &&
          /^[a-zA-Z0-9-]+$/.test(label);
      })
    ) {
      return value;
    }
  }

  // Literal localhost (single word, no dot, exact match).
  if (value === "localhost") {
    return value;
  }

  throw new ConfigError(
    "CONFIG_INVALID_HOSTNAME",
    `config field "${field}" must be a valid IPv4 address, bracketed IPv6 address, or DNS hostname`,
    { field, value },
  );
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
    if (entry.includes("\0")) {
      throw new ConfigError(
        "CONFIG_INVALID_SHAPE",
        `config field "${field}[${i}]" contains a NUL byte`,
        { field: `${field}[${i}]` },
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

/**
 * Resolve a discovery block (`routes` or `islands`) from raw input and
 * defaults. The two discovery blocks share identical resolution logic.
 */
function resolveDiscovery(
  raw: unknown,
  defaults: Required<DiscoveryConfig>,
  label: "routes" | "islands",
  root: string,
): Required<DiscoveryConfig> {
  const input = raw === undefined ? {} as Record<string, unknown> : requireObject(raw, label);
  rejectUnknownKeys(input, ALLOWED_DISCOVERY_KEYS, label);
  return {
    dir: resolveInsideRoot(input.dir ?? defaults.dir, root, `${label}.dir`, false) as string,
    include: requireGlobList(input.include ?? defaults.include, `${label}.include`),
    exclude: requireGlobList(input.exclude ?? defaults.exclude, `${label}.exclude`),
  };
}

/**
 * Resolve a boolean field that defaults based on the run mode. If the
 * user supplied a value it must be a boolean; otherwise the mode-derived
 * default is returned.
 */
function resolveModeDrivenBoolean(
  raw: unknown,
  mode: Mode,
  field: string,
  defaultFor: (mode: Mode) => boolean,
): boolean {
  if (raw === undefined) return defaultFor(mode);
  if (typeof raw !== "boolean") {
    throw new ConfigError(
      "CONFIG_INVALID_SHAPE",
      `config field "${field}" must be a boolean`,
      { field, actual: typeof raw },
    );
  }
  return raw;
}

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------

/**
 * Validate a `ConfigInput` against the schema and produce a fully
 * resolved `ResolvedConfig`.
 *
 * The function performs filesystem existence checks for the
 * `styles.app` stylesheet (both user-supplied and the default
 * `<root>/src/styles/app.css` lookup). It does not import any user
 * code. `loadConfig` is the file-aware wrapper that calls this after
 * the config-file import.
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
    if (!ALLOWED_TOP_KEYS.has(key as keyof ConfigInput)) {
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

  // publicDir is a directory (not a single file); it may be created lazily
  // by asset middleware on first request. We intentionally do not stat it at
  // config-load time — only styles.app is existence-checked.
  const publicDirRaw = top.publicDir === undefined ? DEFAULTS.publicDir : top.publicDir;
  const publicDir = publicDirRaw === false
    ? null
    : resolveInsideRoot(publicDirRaw, rootAbs, "publicDir", true) as string | null;

  // -----------------------------------------------------------------------
  // routes / islands discovery
  // -----------------------------------------------------------------------
  const routes = resolveDiscovery(top.routes, DEFAULTS.routes, "routes", rootAbs);
  const islands = resolveDiscovery(top.islands, DEFAULTS.islands, "islands", rootAbs);

  // -----------------------------------------------------------------------
  // styles
  //
  // styles.app resolves to <root>/src/styles/app.css by default. A
  // missing stylesheet at either the explicit or default path is a
  // startup error. Set styles.app = false to opt out entirely.
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
      throw new ConfigError(
        "CONFIG_INVALID_PATH",
        `config field "styles.app" points to a missing file`,
        { path: resolved },
      );
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
    if (exists) {
      stylesApp = candidate;
    } else {
      throw new ConfigError(
        "CONFIG_INVALID_PATH",
        `config field "styles.app" points to a missing file`,
        { path: candidate },
      );
    }
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
      "CONFIG_INVALID_SHAPE",
      `config field "build.compress" must be false or "gzip"`,
      { field: "build.compress", actual: String(buildInput.compress) },
    );
  }

  // Mode-driven defaults for sourcemap and minify.
  const sourcemap = resolveModeDrivenBoolean(
    buildInput.sourcemap,
    options.mode,
    "build.sourcemap",
    (m) => MODE_DRIVEN_BUILD_DEFAULTS[m].sourcemap,
  );
  const minify = resolveModeDrivenBoolean(
    buildInput.minify,
    options.mode,
    "build.minify",
    (m) => MODE_DRIVEN_BUILD_DEFAULTS[m].minify,
  );

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
    : requireHostname(serverInput.hostname, "server.hostname");
  const port = serverInput.port === undefined
    ? DEFAULTS.server.port
    : requirePort(serverInput.port, "server.port");

  return {
    mode: options.mode,
    root: rootAbs,
    srcDir,
    publicDir,
    outDir,
    routes,
    islands,
    styles: { app: stylesApp },
    build: { compress, sourcemap, minify, frozenAssetCache },
    server: { hostname, port },
  };
}
