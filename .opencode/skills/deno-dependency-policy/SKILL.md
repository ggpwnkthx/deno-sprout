---
name: deno-dependency-policy
description: Enforce Deno dependency conventions such as preferring pinned jsr imports, avoiding Node-only APIs, and minimizing dependency weight.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: policy
---

## What I do

I help enforce **dependency and import policy** for a Deno project.

I focus on:

- preferring `jsr:` packages
- pinning package versions
- avoiding `https://deno.land/...` imports unless explicitly approved
- avoiding Node compatibility APIs unless the project requires them
- keeping dependencies minimal and justified

## When to use me

Use me when:

- adding a new dependency
- reviewing imports in a PR
- migrating from Node or Bun scripts to Deno
- checking whether an external package is necessary
- standardizing the repo's dependency policy

## Rules

1. Prefer built-ins before third-party packages.
2. Prefer small focused `jsr:` packages over large general-purpose dependencies.
3. Pin versions for external imports.
4. Avoid Node-only APIs in app code unless the repo has explicitly chosen Node
   compatibility.
5. Avoid mixing multiple styles of dependency sourcing without a clear reason.
6. Flag imports that make permissions broader than necessary.
7. Flag packages that duplicate a Deno standard capability or built-in Web API.

## Review checklist

For each new dependency or import:

- What problem does it solve?
- Can Deno built-ins solve it instead?
- Is the source `jsr:` and version-pinned?
- Does it introduce Node assumptions?
- Does it expand runtime permissions?
- Does it add heavy transitive surface area?
- Is the import location appropriate for the layer that uses it?

## Output format

### Dependency decisions

- one bullet per dependency or import

### Policy violations

- concrete bullets

### Safer alternatives

- concrete replacements

### Recommended edits

- short actionable list

## Style rules

- Be conservative about new dependencies.
- Prefer explicit reasoning over blanket rules.
- If a non-`jsr:` import is acceptable, explain why.
