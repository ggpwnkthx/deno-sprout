# Sprout Build Plan

## 10. Dev Server Specification

Dev server responsibilities:

- resolve config;
- discover project;
- create app;
- render routes;
- compile runtime/island/CSS assets on demand;
- expose source maps;
- no-store cache headers;
- clear, overlay-free error responses.

Asset routes:

```text
GET /@sprout/runtime.js
GET /@sprout/app.css
GET /@sprout/island/<id>.js
GET /@sprout/island/<id>.js.map
```

Development cache invalidation:

- cache compiled output by entry, kind, mode, public env hash, and input set hash;
- re-stat known input paths before serving cached output;
- coalesce concurrent cold builds for the same key.
