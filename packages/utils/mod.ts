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
export { FrameworkError } from "./errors.ts";
export type { FrameworkErrorDetails } from "./errors.ts";
export { isInsideRoot, slash } from "./path.ts";
export { acceptsGzip } from "./http.ts";
