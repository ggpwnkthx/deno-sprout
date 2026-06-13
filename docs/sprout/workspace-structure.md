# Sprout Build Plan

## 4. Workspace Structure

```text
packages/
  core/
    mod.ts
    server/
      app.ts
      context.ts
      render_route.tsx
      html_shell.tsx
      static_files.ts
      errors.ts
    runtime.entry.ts
    README.md
    deno.jsonc

  cli/
    cli.ts
    commands/
      init.ts
      dev.ts
      build.ts
      serve.ts
    templates/
      deno.jsonc.txt
      sprout.config.ts.txt
      routes/index.tsx.txt
      islands/Counter.tsx.txt
      styles/app.css.txt
    README.md
    deno.jsonc

  config/
    mod.ts
    define_config.ts
    load_config.ts
    schema.ts
    types.ts
    errors.ts
    README.md
    deno.jsonc

  compiler/
    mod.ts
    discover/
      routes.ts
      islands.ts
      styles.ts
      filesystem.ts
    manifest/
      types.ts
      validate.ts
      paths.ts
    build/
      esbuild.ts
      virtual_modules.ts
      frozen_assets.ts
      dev_assets.ts
      gzip.ts
    errors.ts
    README.md
    deno.jsonc

  jsx/
    jsx-runtime.ts
    jsx-dev-runtime.ts
    server/
      jsx-runtime.ts
      jsx-dev-runtime.ts
      island_registry.ts
      island_placeholder.ts
    dom/
      jsx-runtime.ts
      jsx-dev-runtime.ts
    shared/
      props.ts
      errors.ts
      types.ts
    README.md
    deno.jsonc

  runtime/
    mod.ts
    mount_all.ts
    mount_island.ts
    module_contract.ts
    errors.ts
    README.md
    deno.jsonc

  utils/
    mod.ts
    path.ts
    hash.ts
    http.ts
    streams.ts
    errors.ts
    README.md
    deno.jsonc

examples/
  basic/
  blog/
  islands/
  forms/

tests/
  fixtures/
    basic-app/
    nested-routes/
    broken-config/
    invalid-islands/
```
