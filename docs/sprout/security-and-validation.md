# Sprout Build Plan

## 13. Security and Validation Rules

### Paths

- All discovered files must resolve inside project root.
- Reject NUL bytes in paths.
- Reject path traversal in public asset URLs.
- Never use string-prefix root checks; use relative path containment checks.

### Props

- Island props must be JSON records.
- Reject circular values.
- Enforce max serialized length.
- Reject top-level arrays and `null`.

### Public URLs

- Framework reserves `"/@sprout/"`.
- Public directory files must not shadow framework URLs.
- Island URLs must be canonical and extension-normalized.

### OutDir

Production build may empty `outDir` only when:

- it does not exist;
- it exists and is empty;
- it exists and contains a prior `sprout.manifest.json`.

Otherwise fail with a typed `BUILD_OUTDIR_UNSAFE` error.
