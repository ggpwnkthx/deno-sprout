---
name: deno-performance-check
description: Review Deno code for memory safety, streaming opportunities, whole-payload reads, pagination gaps, and avoidable algorithmic complexity.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: performance
---

## What I do

I review Deno code for **memory and complexity risks**.

I focus on:

- whole-payload reads that should stream or chunk
- unbounded buffering and accidental copies
- missing pagination, cursors, or batching
- avoidable O(n^2) scans
- large JSON or file processing done eagerly
- response or request handling that reads too much at once

## When to use me

Use me for:

- API handlers
- file processing
- CLI tools that touch large datasets
- background jobs
- database scans
- code that feels “fine” on small inputs but risky at scale

## Review checklist

1. Look for whole-input reads:
   - `await req.text()`
   - `await req.json()`
   - `Deno.readTextFile`
   - `Array.from(...)` over large iterables
   - `await response.text()` on large bodies

2. Check whether streaming or chunked processing is possible:
   - `ReadableStream`
   - readers/writers
   - async iterables
   - line-by-line or record-by-record processing

3. Check whether collection operations scale:
   - nested loops
   - repeated filtering inside loops
   - repeated JSON serialization
   - repeated path scanning or globbing

4. Check external boundaries:
   - missing pagination for list endpoints
   - full-table scans
   - loading every result before filtering
   - sorting huge collections in memory

5. Prefer incremental improvements:
   - indexing/maps/sets
   - streaming pipelines
   - chunked reads
   - cursors or page limits
   - early exits

## Output format

### Risk summary

- 1 short paragraph

### Memory hot spots

- bullets with concrete code patterns

### Complexity hot spots

- bullets with concrete code patterns

### Better approaches

- bullets with specific alternatives

### Priority fixes

- highest-value edits first

## Style rules

- Call out both actual and likely scale risks.
- Separate “must fix” from “worth improving”.
- Do not invent benchmark numbers.
