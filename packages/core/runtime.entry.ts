// Browser runtime entry stub.
//
// The real implementation lands in M4 (on-demand dev compiler) and
// M6 (production build). The M4 compiler emits a generated module
// that imports `@sprout/runtime` and calls `mountAll()` after
// `DOMContentLoaded`. The M6 production build emits a
// content-hashed, minified version of the same module.
//
// For M3 the file exists so the HTML shell can include a stable
// script URL (`/@sprout/runtime.js`) and so Hono's middleware
// chain has a file to resolve to once M4 wires the dev asset
// pipeline. The function is a no-op for now.

/**
 * No-op bootstrap. Replaced in M4 by the generated runtime module.
 */
export function start(): void {
  // Intentionally empty. M4 will replace this with a generated
  // module that calls `mountAll()` on `DOMContentLoaded`.
}
