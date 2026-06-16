// Public re-exports for `@sprout/jsx/shared`.
//
// This subpath is intended for code that needs the JSON prop helpers and
// runtime error types without pulling in the Hono-based JSX runtimes.
export { DEFAULT_MAX_SERIALIZED_PROPS_CHARS, parseJsonProps, serializeJsonProps } from "./props.ts";
export { RuntimeError } from "./errors.ts";
export type { JsonPrimitive, JsonRecord, JsonValue, RuntimeErrorCode } from "./types.ts";
export {
  ISLAND_PATH_PREFIX,
  ISLAND_PATH_SUFFIX,
  ISLAND_PUBLIC_PATTERN,
  type IslandPathValidation,
  type IslandPathValidationReason,
  validateIslandPublicPath,
} from "./island_path.ts";
