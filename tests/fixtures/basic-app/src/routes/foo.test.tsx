// A file matching the default test exclude glob (`**/*.test.{ts,tsx}`)
// but containing no `Deno.test` calls. The compiler should drop this
// from discovery, just like `_helpers.ts`.
export const _isExcludedByTestGlob = true;
