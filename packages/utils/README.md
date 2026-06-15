# @sprout/utils

Small, environment-safe helpers shared by every Sprout package: typed base error, slash-normalized
path helpers, and gzip `Accept-Encoding` negotiation.

`@sprout/utils` is the foundation every other package builds on. It holds no framework semantics —
only pure, deterministic helpers that manipulate the values they are given and never call Deno APIs.
The package's three exports (`FrameworkError`, the path helpers, and `acceptsGzip`) are the shared
vocabulary for the rest of the framework: every typed error subclasses `FrameworkError`, every path
comparison goes through `slash` and `isInsideRoot`, and the production serve negotiates gzip through
`acceptsGzip`.

## Public surface

- `FrameworkError<Code, Details>` — base typed error class. The `code` is a stable identifier from
  the package's error-code union; `details` is a shallowly frozen, JSON-serializable object. Other
  packages subclass it (`ConfigError`, `CompilerError`, `CoreError`, `RuntimeError`, `CliError`).
- `FrameworkErrorDetails` — the canonical `Readonly<Record<string, unknown>>` shape for the
  `details` object.
- `slash(input)` — normalize a path string to slash form (backslashes to forward slashes,
  run-collapse, trailing-slash strip, `./` strip). Non-string input or NUL bytes return `""`.
- `isInsideRoot(candidate, root)` — strict containment check for absolute paths. Rejects NUL bytes,
  non-absolute paths, sibling-prefix escapes, and an empty `root`.
- `acceptsGzip(header)` — parse an `Accept-Encoding` header and return whether the caller will
  accept a `gzip`-encoded body. The implementation is RFC 7231 §5.3.4 aware: `gzip;q=0` is treated
  as an explicit refusal, and sub-1 q-values mean "not really accepted".

## Links

- [Repository](https://github.com/ggpwnkthx/deno-sprout)
- [Sprout documentation](https://jsr.io/@sprout/core) — the framework docs hub, hosted on
  `@sprout/core`'s JSR page.
- [Permissions](https://jsr.io/@sprout/utils) — `@sprout/utils` calls no Deno APIs; no permissions
  are required.

## License

MIT
