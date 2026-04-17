---
name: deno-http-boundary-audit
description: Audit Deno HTTP handlers for request validation, typed failures, response contracts, config parsing, and transport-to-domain boundary discipline.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  runtime: deno
  category: api
---

## What I do

I review **HTTP and API boundaries** in Deno services.

I focus on:

- validation of path params, query params, headers, cookies, and request bodies
- centralized parsing of env and config
- typed error shapes and stable response contracts
- thin handlers that delegate domain work cleanly
- safe request body handling and predictable status codes

## When to use me

Use me when:

- building or reviewing API handlers
- debugging bad input handling
- improving typed failures
- standardizing response and error contracts

## Review checklist

1. Identify every untrusted input:
   - params
   - query string
   - body
   - headers
   - cookies
   - env/config

2. Confirm validation happens before business logic.
3. Confirm handler code converts transport data into typed domain input.
4. Confirm errors are normalized:
   - validation errors
   - auth errors
   - not found
   - conflict
   - unexpected internal failures

5. Confirm responses are stable:
   - explicit shape
   - intentional status code
   - no accidental leakage of internal details

6. Check request-body behavior:
   - avoid duplicate body reads
   - avoid full-body reads when streaming is better
   - handle malformed JSON clearly

## Output format

### Boundary summary

- short paragraph

### Validation gaps

- bullets

### Error-shape gaps

- bullets

### Response-contract issues

- bullets

### Recommended edits

- prioritized bullets

## Style rules

- Be concrete about where validation should move.
- Separate transport concerns from domain concerns.
- Prefer centralized helpers over repeated inline checks.
