# Sprout Build Plan

## 14. Memory and I/O Rules

- Do not read entire public directories into memory.
- Do not preload frozen asset bytes at production startup.
- Metadata maps are acceptable; byte maps must be opt-in and bounded.
- Use streaming responses for public files where possible.
- Build outputs may be in memory during compilation, but immediately write production assets to disk.
- Large request bodies are out of scope for the core renderer; endpoint handlers own their own body reads.
- Any helper that converts a stream to bytes must accept an explicit max byte limit.
