---
name: opencode-session-discipline
description: Guide OpenCode sessions in a Deno repo to prefer deno task and local tools, minimize arbitrary shell usage, verify changes, and summarize results cleanly.
license: MIT
compatibility: opencode
metadata:
  audience: contributors
  runtime: opencode
  category: workflow
---

## What I do

I guide the agent's **working style** inside this repository.

## Goals

- prefer repo-local OpenCode tools before ad hoc shell commands
- prefer `deno task`, `deno test -A`, `deno lint`, and `deno check`
- avoid `node`, `npm`, `pnpm`, `yarn`, and `npx` unless the repo explicitly
  requires them
- keep shell operations inside the worktree
- verify the smallest meaningful scope before claiming completion
- summarize what was changed and what was verified

## When to use me

Use me when the task involves editing code, running checks, or deciding which
commands to run.

## Working rules

1. Read relevant files before editing.
2. Make the smallest coherent change set.
3. Prefer project tools and tasks over one-off shell pipelines.
4. Avoid introducing new dependencies without a clear reason.
5. After edits, run focused verification first, then broader checks if needed.
6. Be explicit about anything not verified.
7. When a command fails, surface the root cause instead of retrying blindly.
8. Keep final summaries concise and operational.

## Final response template

### Changed

- bullets

### Verified

- bullets

### Remaining risk

- bullets if needed

### Next recommended step

- one small step only when it truly helps

## Style rules

- Do not overclaim verification.
- Do not hide command failures.
- Prefer concrete evidence from the repo over generic advice.
