# Sprout Build Plan

## 12. Production Serve Specification

`sprout serve` must:

- resolve config;
- load frozen manifest once;
- build `Map<publicPath, FrozenAssetMetadata>`;
- not eagerly read asset bytes;
- serve raw or gzip bytes based on `Accept-Encoding`;
- set `ETag`;
- return `304` on matching `If-None-Match`;
- set immutable cache headers for hashed framework assets;
- serve public files;
- render server routes from source or compiled route modules depending on final build decision.

For the initial release, production may still import route source files directly at runtime, as long as required permissions and behavior are documented. A later release can add server route bundling.
