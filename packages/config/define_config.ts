// `defineConfig` is the type-level identity helper a user can wrap
// their config object in. It exists purely to improve editor tooling
// and to make `sprout.config.ts` self-documenting:
//
// ```ts
// import { defineConfig } from "@sprout/config";
//
// export default defineConfig({
//   root: ".",
//   outDir: ".sprout/dist",
// });
// ```
//
// The function does not transform the input at runtime; it is the
// identity function. The return type preserves the inferred shape so
// that downstream `as const` and literal-type narrowing carry through.
import type { ConfigInput } from "./types.ts";

/**
 * Identity helper for `sprout.config.ts` default exports.
 *
 * Wrapping the config in `defineConfig(...)` is optional but improves
 * editor hover types and makes the intent of the file explicit. The
 * function is the runtime identity function — the input object is
 * returned unchanged.
 */
export function defineConfig<T extends ConfigInput>(input: T): T {
  return input;
}
