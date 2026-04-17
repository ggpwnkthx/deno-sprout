---
name: deno-architecture-review
description: Review Deno project structure, boundaries, modularity, duplication, and type ownership across routes, domain code, lib helpers, and tests.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: review
---

## What I do

Use this skill when you want a **design and structure review** of a Deno
codebase or change set.

I focus on:

- clear folder boundaries like `src/`, `src/routes/`, `src/domain/`, `src/lib/`,
  and `tests/`
- thin transport layers and explicit domain boundaries
- DRY shared utilities instead of repeated route or service logic
- typed ownership of config, external I/O, domain entities, and errors
- production-grade organization instead of ad hoc script sprawl

## When to use me

Use me for:

- reviewing a pull request or change set
- deciding where a new module should live
- spotting architecture drift
- turning a working prototype into maintainable project structure
- checking whether code follows a Deno-first TypeScript style

## Review checklist

1. Identify the main boundary layers:
   - transport or route handlers
   - domain logic
   - external clients or adapters
   - shared helpers
   - tests

2. Check for misplaced responsibilities:
   - route handlers doing too much business logic
   - domain modules reading env directly
   - helpers reaching into unrelated folders
   - tests depending on unstable internal details

3. Look for duplication and fractured ownership:
   - repeated parsing or validation logic
   - repeated response shaping
   - repeated permission or path handling
   - repeated error formatting

4. Check typing at boundaries:
   - explicit domain types and interfaces
   - no `any`
   - `unknown` narrowed before use
   - config parsed once and exposed as typed values
   - errors represented with stable typed shapes

5. Recommend a concrete target layout only when it simplifies the current code.

## Output format

Use this structure:

### Architecture summary

- 1–3 short paragraphs

### What is working

- concise bullets

### Boundary issues

- concrete bullets with file/symbol references when available

### Suggested structure changes

- small prioritized edits
- include folder or module placement guidance

### Type ownership gaps

- concrete bullets

### Next edits

- 3–7 practical changes

## Style rules

- Prefer pragmatic, incremental edits over large rewrites.
- Favor strong local reasoning from the actual files.
- Call out uncertainty when the surrounding project context is missing.
- Do not praise code that is merely “fine”; be specific.
