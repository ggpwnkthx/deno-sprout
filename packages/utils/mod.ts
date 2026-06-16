// Public surface of `@sprout/utils`.
//
// The package holds small, environment-safe helpers shared by every
// other Sprout package. It does not contain framework semantics.
//
// M2 ships the base `FrameworkError` plus the slash-normalization and
// root-containment helpers (`slash`, `isInsideRoot`). M7 adds the
// `Accept-Encoding` parser (`acceptsGzip`) that the production serve
// uses to negotiate gzip vs raw bytes. Hashing and bounded stream
// helpers remain out of scope until a package that consumes them
// exists.
export { causeMessage } from "./cause.ts";
export { FrameworkError } from "./errors.ts";
export type { FrameworkErrorDetails } from "./errors.ts";
export {
  contentTypeForFilename,
  DEFAULT_CONTENT_TYPE,
  EXTENSION_CONTENT_TYPES,
  extensionOf,
} from "./media_types.ts";
export { isInsideRoot, slash } from "./path.ts";
export { acceptsGzip, NOSNIFF } from "./http.ts";
export { isHttpMethod, SUPPORTED_HTTP_METHODS } from "./http_methods.ts";
export type { HttpMethod } from "./http_methods.ts";
