# Sprout Build Plan

## M10 — Release Candidate

### Goals

Prepare the first publishable JSR release.

### Deliverables

- pinned JSR dependency versions;
- package READMEs;
- changelog;
- smoke tests against generated app;
- publish dry-run;
- API review;
- compatibility matrix for Deno v2.8+.

### Exit Criteria

- All packages pass `deno publish --dry-run`.
- Generated app passes dev and production smoke tests.
- Public API surface is documented.
- No package exposes unnecessary internals.
