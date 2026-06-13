# Sprout Build Plan

## 11. Production Build Specification

`sprout build` must:

1. resolve config;
2. discover project;
3. validate manifest;
4. assert `outDir` is safe to empty;
5. compile runtime;
6. compile vendor bundle if enabled;
7. compile app CSS if present;
8. compile all islands from generated virtual entries;
9. write hashed files;
10. write gzip companions when enabled;
11. write frozen manifest;
12. print a concise summary.

Output summary example:

```text
Built 5 assets into .sprout/dist
  runtime  /@sprout/runtime.js
  style    /@sprout/app.css
  island   /@sprout/island/Counter.js
```
