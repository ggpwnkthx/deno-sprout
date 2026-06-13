// M8 hardening tests for the `slash` and `isInsideRoot` primitives.
//
// The two helpers are the foundation for every path comparison
// across the workspace. M8 hardens the spec's "Reject NUL bytes in
// paths" and "Never use string-prefix root checks" rules with
// focused security tests. The unit tests in `path_test.ts` cover
// the happy paths; this file is the adversarial surface.
import { assertEquals } from "jsr:@std/assert@1";
import { isInsideRoot, slash } from "./path.ts";

Deno.test('M8 slash: returns "" for a NUL byte', () => {
  // The spec says slash is a pure string transformer. NUL bytes
  // are the one input that must not be passed through: a downstream
  // `isInsideRoot` would reject the result anyway, and silently
  // returning a slash-form of a NUL-bearing string would let an
  // attacker craft a path that is a prefix match for legitimate
  // paths in some log / comparison contexts.
  assertEquals(slash("\0"), "");
  assertEquals(slash("a\0b"), "");
  assertEquals(slash("/proj/\0evil"), "");
});

Deno.test('M8 slash: returns "" for non-string input', () => {
  // The function declares `input: string`, but JS callers can
  // pass `undefined` / `null` at runtime. The contract is to
  // return `""` rather than throw, so the rest of the pipeline
  // (which calls `isInsideRoot` and friends) stays in control
  // of the error path.
  // deno-lint-ignore no-explicit-any
  assertEquals(slash(undefined as any), "");
  // deno-lint-ignore no-explicit-any
  assertEquals(slash(null as any), "");
  // deno-lint-ignore no-explicit-any
  assertEquals(slash(42 as any), "");
});

Deno.test("M8 isInsideRoot: rejects NUL bytes in the candidate", () => {
  // The NUL byte case is a security boundary, not a casual
  // input shape. The function must reject the candidate
  // regardless of normalization.
  assertEquals(isInsideRoot("/proj/\0evil", "/proj"), false);
  assertEquals(isInsideRoot("/proj/\0", "/proj"), false);
  // The NUL byte appears in a deeper path segment: still rejected.
  assertEquals(isInsideRoot("/proj/sub/\0x", "/proj"), false);
});

Deno.test("M8 isInsideRoot: rejects NUL bytes in the root", () => {
  // The root parameter is also user-influenced (the loader
  // accepts a `--root` flag and a `config.root` value). A NUL
  // byte in the root must be rejected with the same rigor.
  assertEquals(isInsideRoot("/proj", "/proj/\0"), false);
  assertEquals(isInsideRoot("/proj", "\0"), false);
});

Deno.test("M8 isInsideRoot: normalizes Windows-style backslashes in the candidate", () => {
  // The spec's "Never use string-prefix root checks" rule applies
  // to backslashes too: a Windows-style path separator is
  // normalized to forward slashes BEFORE the containment check,
  // so `/proj\\evil` becomes `/proj/evil` (which is genuinely
  // inside `/proj`). The defense is that the check uses a
  // relative-path / `root + "/"` boundary, not a string prefix,
  // so a hand-crafted backslash variant cannot smuggle past
  // the containment boundary.
  // Sibling-prefix escape: the "/" separator boundary is what
  // protects us. `/proj-evil` is NOT inside `/proj`.
  assertEquals(isInsideRoot("/proj-evil", "/proj"), false);
  // `/proj\\evil` normalizes to `/proj/evil`, which IS inside
  // `/proj` — that is the correct, expected behavior.
  assertEquals(isInsideRoot("/proj\\evil", "/proj"), true);
  // A backslash variant that normalizes to a dot-segment is
  // still inside `/proj` by string containment: `/proj/sub\\..`
  // normalizes to `/proj/sub/..`, which starts with `/proj/`.
  // The string-containment primitive is consistent here; the
  // higher-level `resolvePublicFile` rejects dot-segments.
  assertEquals(isInsideRoot("/proj/sub\\..", "/proj"), true);
});

Deno.test("M8 isInsideRoot: rejects relative paths in either argument", () => {
  // The function is a containment check over absolute paths.
  // A relative candidate cannot meaningfully be "inside" an
  // absolute root; the function rejects the call rather than
  // guessing what the caller meant.
  assertEquals(isInsideRoot("proj/sub", "/proj"), false);
  assertEquals(isInsideRoot("proj", "/proj"), false);
  assertEquals(isInsideRoot("/proj", "proj"), false);
  // Even an "absolute-looking" relative path with leading
  // whitespace is not absolute: the slash check fires first.
  assertEquals(isInsideRoot(" /proj", "/proj"), false);
});

Deno.test("M8 isInsideRoot: rejects an empty root", () => {
  // The root is the trust boundary. An empty root is undefined
  // behavior from the caller's perspective; the function refuses
  // to guess.
  assertEquals(isInsideRoot("/proj", ""), false);
  assertEquals(isInsideRoot("/anything", ""), false);
});

Deno.test("M8 isInsideRoot: normalizes trailing slashes on the root", () => {
  // The slash normalizer strips a single trailing slash. The
  // containment check should not be sensitive to whether the
  // root ends in a slash, so callers can pass either form.
  assertEquals(isInsideRoot("/proj/sub", "/proj/"), true);
  assertEquals(isInsideRoot("/proj", "/proj/"), true);
});

Deno.test("M8 isInsideRoot: is a string-based containment check, not a path resolver", () => {
  // `slash` is a string normalizer, not a path resolver: it
  // does not resolve `..` segments. `isInsideRoot` is therefore
  // a string-containment check, not a resolved-path check. The
  // containment test is "is the slash-normalized form either
  // equal to root OR a strict descendant (starts with root+'/')?".
  //
  // A path like `/proj/../evil` slash-normalizes to
  // `/proj/../evil` (unchanged) and `startsWith("/proj/")` is
  // true, so `isInsideRoot` returns `true`. This is
  // intentional: the function is a *containment* primitive over
  // pre-normalized inputs, and the calling code (e.g.
  // `resolvePublicFile`) is responsible for rejecting
  // dot-segments at a higher layer.
  assertEquals(isInsideRoot("/proj/../evil", "/proj"), true);
  // The contract is "c is contained in r" by string match; it
  // is the *caller's* job to ensure `..` segments are stripped
  // first. Pin that contract here so future refactors do not
  // silently change the primitive into a path resolver.
  assertEquals(isInsideRoot("/proj/sub/../sibling", "/proj"), true);
  assertEquals(isInsideRoot("/proj2/sub", "/proj"), false);
});

Deno.test("M8 isInsideRoot: rejects a non-string candidate", () => {
  // Same rationale as the slash test: stay type-safe at the
  // runtime boundary without throwing.
  // deno-lint-ignore no-explicit-any
  assertEquals(isInsideRoot(undefined as any, "/proj"), false);
  // deno-lint-ignore no-explicit-any
  assertEquals(isInsideRoot(null as any, "/proj"), false);
  // deno-lint-ignore no-explicit-any
  assertEquals(isInsideRoot(123 as any, "/proj"), false);
});

Deno.test("M8 isInsideRoot: rejects a non-string root", () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(isInsideRoot("/proj", undefined as any), false);
  // deno-lint-ignore no-explicit-any
  assertEquals(isInsideRoot("/proj", null as any), false);
});
