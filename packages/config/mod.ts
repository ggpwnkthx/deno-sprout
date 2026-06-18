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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  BuildConfig,
  ConfigInput,
  DiscoveryConfig,
  IslandDiscoveryConfig,
  Mode,
  ResolvedConfig,
  RouteDiscoveryConfig,
  StyleConfig,
} from "./types.ts";
export type { ResolvedDiscovery, ResolvedServer } from "./types.ts";
export type { FrameworkErrorDetails } from "@sprout/utils";
export type { LoadConfigOptions } from "./load_config.ts";

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------
export { defineConfig } from "./define_config.ts";
export { loadConfig } from "./load_config.ts";
export { resolveConfig } from "./resolve_config.ts";
export { FrameworkError } from "@sprout/utils";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export { ConfigError } from "./errors.ts";
export type { ConfigErrorCode } from "./errors.ts";
