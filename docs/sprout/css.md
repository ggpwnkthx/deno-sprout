# Sprout Build Plan

## 9. CSS Specification

Initial CSS support:

- global app CSS only;
- discovered at `src/styles/app.css`;
- served at `/@sprout/app.css`;
- compiled by the same compiler package;
- linked from every HTML response when present.

Deferred CSS support:

- route-specific CSS;
- island-specific CSS;
- CSS modules;
- CSS extraction from island imports;
- critical CSS.

The MVP should not block on advanced CSS.
