# Security

Sprout's security model is "the framework rejects anything it can
prove is unsafe, and the rest is the application's responsibility".
This page is the user-facing summary. The full error-code table and
the per-command Deno permission table are in the developer
reference:

- [Permissions](sprout/permissions.md) — the per-command Deno
  permission table with rationale.
- [Errors](sprout/errors.md) — the per-package error code table
  with where-thrown and what-means.

## Paths

Every path field in the config is validated against the project
root with `isInsideRoot` from `@sprout/utils`. The check is
relative-path containment, not string-prefix containment:

- `/srv/my-app` contains `/srv/my-app/src/routes/index.tsx`.
- `/srv/my-app` does NOT contain `/srv/my-app-other/...`. The
  string-prefix check would; the containment check does not.
- `/foo/bar` does NOT contain `/foo/bar-baz`. The string-prefix
  check would; the containment check does not.

The result is that sibling-prefix escapes (e.g. `outDir: "../outside"`)
fail with `CONFIG_PATH_OUTSIDE_ROOT` at config load time. NUL bytes
in any path field fail with `CONFIG_INVALID_PATH`. The same rules
apply to dynamic values that flow through the public file resolver
or the manifest loader: a NUL byte or a `..` segment is rejected
before it reaches the filesystem.

## Public URL namespace

The framework reserves the `/@sprout/` URL prefix. The reserved
paths are:

- `/@sprout/runtime.js` — the browser runtime.
- `/@sprout/app.css` — the global stylesheet.
- `/@sprout/island/<id>.js` — the per-island bundles.

A public file at `public/@sprout/runtime.js` does NOT shadow the
framework route. The framework's `resolvePublicFile` short-circuits
to `STATIC_FILE_NOT_FOUND` for any URL under `/@sprout/`, so the
framework asset wins. The spec rule — "public files must not
override reserved framework URLs" — is enforced at the public-file
resolver, not at the filesystem.

The island public paths are also validated as canonical at
discovery time. A file that would produce a non-canonical URL
(dot-segments, NUL bytes, empty segments) fails with
`MANIFEST_INVALID_PUBLIC_PATH`. The full validation is in
`@sprout/compiler`'s `islandFileToPublicPath`.

## Props

The framework's `serializeJsonProps` helper enforces the island
prop rules at render time. A violation throws
`RuntimeError("INVALID_PROPS", ...)` with a `details.reason` that
identifies the failure kind. The full set of rejection reasons:

| Reason             | Trigger                                                  |
| ------------------ | -------------------------------------------------------- |
| `not_record`       | Top-level value is not a plain object record.            |
| `undefined`        | A value (or a nested value) is `undefined`.              |
| `symbol`           | A value is a `Symbol`.                                   |
| `bigint`           | A value is a `bigint`.                                   |
| `function`         | A value is a function.                                   |
| `date`             | A value is a `Date`.                                     |
| `class_instance`   | A value is a class instance (or any non-plain object).   |
| `map`              | A value is a `Map`.                                      |
| `set`              | A value is a `Set`.                                      |
| `typed_array`      | A value is an `ArrayBuffer` or typed array view.         |
| `circular`         | The value (or a nested value) contains a cycle.          |
| `non_finite_number`| A number is `NaN`, `Infinity`, or `-Infinity`.            |
| `json_parse`       | The runtime tried to parse the props string and failed.  |

The default cap on serialized props is 65,536 characters. A
larger serialized string throws `PROPS_TOO_LARGE` with the actual
length and the configured cap in `details.length` and `details.max`.

These rules exist to keep the placeholder HTML well-formed. A
non-JSON-serializable prop would either crash the JSON
serialization step, or produce a placeholder the runtime cannot
parse. The framework rejects both at the boundary instead of
shipping a broken page to the browser.

## `outDir` safety

The production build refuses to empty a non-empty `outDir` unless
the only entry is a prior `sprout.manifest.json`. The error is
`BUILD_OUTDIR_UNSAFE`. The offending entries are listed in
`details.entries`.

The motivation is "I just ran `sprout build` and it wiped my
unrelated `dist/` directory". The rule is conservative: a missing
directory is fine, an empty directory is fine, and a directory
containing exactly one file named `sprout.manifest.json` is fine.
Anything else fails loudly.

If you intentionally want to use a directory that contains
unrelated files, the M9 release does not provide an escape hatch.
The fix is to point `outDir` at a directory that does not contain
unrelated files.

## Frozen manifest validation

The frozen manifest loader rejects:

- A manifest with the wrong `version` (`FROZEN_MANIFEST_UNSUPPORTED`).
- A manifest with missing `assets` or missing `file` fields.
- A manifest with a duplicate `publicPath`.
- A manifest referencing a missing on-disk file.
- A manifest with a path containing `..` or a NUL byte.

The last rule is the security-sensitive one: the manifest is a
data file that the serve path reads from disk, and a malicious
manifest could otherwise point at a file outside `<outDir>`. The
loader catches the obvious escapes; the same `isInsideRoot` check
is the safety net.

## What the framework does not do

The framework is intentionally narrow. It does not, in the M9
release:

- Authenticate requests. Application code is responsible for any
  authentication, authorization, or session management. The
  `RequestContext.locals` map is the standard place to thread
  identity through middleware.
- Rate-limit. Same. The `RequestContext` exposes the standard
  Deno `Request`; rate-limiting code is application-level.
- Sanitize user input in route handlers. Route handlers should
  validate and sanitize any user-controlled input before using it
  in a database query, a shell call, or a downstream service. The
  framework's prop validation is for *outbound* data (island
  props), not for *inbound* data (route handler input).
- Handle CSRF for state-changing routes. Application code that
  accepts a `POST` is responsible for the CSRF posture that
  matches the deployment.
- Manage secrets. Use Deno's environment variables (and your
  deploy target's secret store) for any credentials.

The framework's job is to be a small, well-typed, hard-to-misuse
HTTP server. It is not a security framework.

## Reporting issues

If you find a security issue in Sprout itself (a path-traversal
bug, a manifest-injection bug, a prop-validation bypass), please
open a private issue. The repo's `SECURITY.md` has the
coordination details.
