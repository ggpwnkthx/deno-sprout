# Sprout Build Plan

## M7 — Production Serve

### Goals

Serve built assets and app routes in production mode.

### Deliverables

- frozen manifest loader;
- O(1) public path index;
- lazy asset byte reads;
- gzip negotiation;
- ETag handling;
- immutable cache headers;
- optional bounded LRU.

### Exit Criteria

- `sprout serve` serves production assets from the frozen manifest.
- `If-None-Match` returns `304`.
- `gzip;q=0` does not receive gzip.
- Startup does not load all asset bytes.

---
