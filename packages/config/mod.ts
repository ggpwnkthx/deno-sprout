// Public surface of `@sprout/config`.
//
// The package defines and validates the project configuration
// contract. It produces a fully resolved config with absolute,
// slash-normalized paths and validated options that every other
// package consumes.
//
// ```ts
// import { defineConfig, loadConfig } from "@sprout/config";
//
// export default defineConfig({ root: "." });
// ```
export { defineConfig } from "./define_config.ts";
export type {
  BuildConfig,
  ConfigInput,
  IslandDiscoveryConfig,
  Mode,
  ResolvedConfig,
  RouteDiscoveryConfig,
  StyleConfig,
} from "./types.ts";
export type { FrameworkErrorDetails } from "@sprout/utils";
export { FrameworkError } from "@sprout/utils";
export type { LoadConfigOptions } from "./load_config.ts";
export { loadConfig, resolveConfig } from "./load_config.ts";
export { ConfigError } from "./errors.ts";
export type { ConfigErrorCode } from "./errors.ts";
