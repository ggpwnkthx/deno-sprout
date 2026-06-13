# Sprout Build Plan

## 8. Manifest and Asset Specification

### In-Memory Manifest

The manifest is internal, generated, and versioned:

```ts
export type Manifest = {
  readonly version: 1;
  readonly routes: readonly RouteEntry[];
  readonly islands: readonly IslandEntry[];
  readonly styles: {
    readonly app: StyleEntry | null;
  };
};
```

### Frozen Manifest

Production builds write:

```text
<outDir>/sprout.manifest.json
```

Shape:

```ts
export type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};
```

### Content-Hashed Asset Files

```text
.sprout/dist/
  sprout.manifest.json
  _sprout/
    runtime.<hash16>.js
    vendor.<hash16>.js
    island-Counter.<hash16>.js
    style-app.<hash16>.css
```

### Browser Public URLs

Manifest entries map stable public paths to hashed files:

```json
{
  "kind": "island",
  "id": "Counter",
  "publicPath": "/@sprout/island/Counter.js",
  "file": "_sprout/island-Counter.0123456789abcdef.js",
  "contentType": "text/javascript; charset=utf-8",
  "hash": "..."
}
```

Public URLs stay stable; file paths are content-hashed.
