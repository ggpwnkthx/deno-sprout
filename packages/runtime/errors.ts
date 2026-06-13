// Re-export of the stable runtime error from `@sprout/jsx/shared` so
// browser code that imports `@sprout/runtime` does not have to also
// import the JSX package to get the class.
export { RuntimeError } from "@sprout/jsx/shared";
export type { RuntimeErrorCode } from "@sprout/jsx/shared";
