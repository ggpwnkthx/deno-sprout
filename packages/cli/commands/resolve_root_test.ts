import { assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { CliError } from "../errors.ts";
import { resolveRoot } from "./resolve_root.ts";

Deno.test("resolveRoot(undefined) returns slash-normalized Deno.cwd()", () => {
  const result = resolveRoot(undefined);
  const cwd = Deno.cwd().replace(/\/$/, "");
  assertEquals(result, cwd);
});

Deno.test("resolveRoot slash-normalizes the result", () => {
  // Backslashes become forward slashes.
  assertEquals(resolveRoot("/tmp\\foo"), "/tmp/foo");
  // Runs of / collapse.
  assertEquals(resolveRoot("/tmp//foo"), "/tmp/foo");
  // Leading ./ is stripped.
  assertEquals(resolveRoot("./foo"), Deno.cwd() + "/foo");
});

Deno.test("resolveRoot resolves a relative path against Deno.cwd()", () => {
  const expected = Deno.cwd() + "/relative";
  assertEquals(resolveRoot("relative"), expected);
});

Deno.test("resolveRoot resolves a nested relative path against Deno.cwd()", () => {
  const expected = Deno.cwd() + "/nested/dir";
  assertEquals(resolveRoot("nested/dir"), expected);
});

Deno.test("resolveRoot returns Deno.cwd() for a single dot", () => {
  assertEquals(resolveRoot("."), Deno.cwd());
});

Deno.test("resolveRoot rejects an empty string with CLI_INVALID_ARGS", () => {
  const err = assertThrows(() => resolveRoot(""), CliError);
  assertEquals(err.code, "CLI_INVALID_ARGS");
  assertStringIncludes(err.message, "empty");
});

Deno.test("resolveRoot rejects a NUL-byte path with CLI_INVALID_ARGS", () => {
  const nulPath = "a" + String.fromCharCode(0) + "b";
  const err = assertThrows(() => resolveRoot(nulPath), CliError);
  assertEquals(err.code, "CLI_INVALID_ARGS");
  assertStringIncludes(err.message, "NUL");
});
