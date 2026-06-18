// File-aware config loader.
//
// `loadConfig` is the public entry point for loading a project
// configuration from the filesystem. It resolves the project root,
// checks for a `sprout.config.ts` file, imports it via dynamic
// `import()`, and then delegates schema validation to `resolveConfig`
// (in `resolve_config.ts`).
//
// `resolveConfig` is exported separately so that tests (and future
// tooling) can validate a config object without touching the
// filesystem.
import { join, toFileUrl } from "@std/path";
import { slash } from "@sprout/utils";
import { ConfigError } from "./errors.ts";
import type { ConfigInput, Mode, ResolvedConfig } from "./types.ts";
import { resolveConfig } from "./resolve_config.ts";

/** Options for {@link loadConfig}. */
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
    const stat = await Deno.stat(configFile);
    fileExists = stat.isFile;
  } catch (_cause) {
    fileExists = false;
  }

  if (fileExists) {
    const fileUrl = toFileUrl(configFile).href;
    let mod: Record<string, unknown>;
    try {
      // The specifier is the user's own config file path, resolved at
      // runtime. JSR's `publish` analyzer cannot statically analyze
      // this dynamic import; the resulting `unanalyzable-dynamic-import`
      // warning is expected and harmless (the specifier is resolvable
      // at runtime in the consumer's own environment).
      mod = await import(fileUrl) as Record<string, unknown>;
    } catch (cause) {
      throw new ConfigError(
        "CONFIG_IMPORT_FAILED",
        `failed to import config file ${configFile}`,
        { path: configFile },
        cause,
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
