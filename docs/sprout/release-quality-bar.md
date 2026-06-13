# Sprout Build Plan

## 19. Release Quality Bar

A release candidate must satisfy:

- strict TypeScript across every package;
- no `any` in public APIs;
- no Node.js APIs;
- JSR-only dependencies;
- no package dependency cycles;
- all untrusted input validated;
- all framework-thrown public errors typed;
- Deno permissions documented;
- production startup does not eagerly load all asset bytes;
- generated app works in dev and production;
- docs show the intended DX first.
