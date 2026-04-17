---
name: deno-release-checklist
description: Run a Deno-focused pre-merge or pre-release checklist covering formatting, linting, type checks, tests, permissions, dependency hygiene, and operator notes.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: workflow
---

## What I do

I provide a **repeatable release and pre-merge checklist** for Deno
repositories.

## When to use me

Use me when:

- preparing a PR for merge
- cutting a release
- validating a risky refactor
- auditing whether a change is operationally ready

## Checklist

### Verification

- run `deno fmt --check`
- run `deno lint`
- run `deno check`
- run the smallest useful test set first
- expand to broader tests when risk is high

### Dependency sanity

- confirm new imports are justified
- prefer pinned `jsr:` dependencies
- confirm no accidental Node/npm workflow drift

### Permission review

- note whether the change requires:
  - `--allow-read`
  - `--allow-write`
  - `--allow-env`
  - `--allow-net`
  - `--allow-run`
- check whether permissions can be narrowed

### Operational review

- config and env changes documented
- any new files or directories created intentionally
- error messages and logs remain useful
- large-input behavior considered
- tests cover the most failure-prone paths

## Output format

### Release readiness

- Ready / Needs work

### Checks run

- bullets

### Risks to resolve

- bullets

### Permission notes

- bullets

### Merge or release recommendation

- 1 short paragraph

## Style rules

- Prefer concrete evidence over generic reassurance.
- State clearly which checks were not run.
- Highlight the smallest set of work needed to get to ready.
