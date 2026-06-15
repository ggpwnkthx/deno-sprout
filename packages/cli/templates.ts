// Inline templates for `sprout init`.
//
// The templates are exported as string constants so the CLI has no
// runtime dependency on the filesystem: the package layout does
// not need a `templates/` directory and the generated files are
// always the version that ships in the package. A future milestone
// can move the templates to disk (or to a `sprout/template-...`
// JSR package) without changing the `runInit` contract.
//
// The strings are kept as close to the canonical
// `docs/sprout/packages/cli.md` shape as possible. M10 pins every
// `@sprout/*` import to `0.2.0`; release automation bumps the patch
// version on every release.

/**
 * `deno.jsonc` for a generated project.
 *
 * The import map must mirror the workspace's import map closely
 * enough that the dev pipeline's `deno-resolver` plugin can
 * resolve every framework package the M4 bundler needs while
 * walking up from each imported file's location. The previous
 * single-entry version (only `@sprout/core`) was incomplete and
 * broke the dev pipeline: a freshly-init'd project failed to
 * compile `src/islands/Counter.tsx` (needs
 * `@sprout/jsx/dom/jsx-runtime` and `@sprout/jsx/dom/jsx-dev-runtime`),
 * the generated virtual island entry (needs `@sprout/runtime`),
 * and the JSX type imports used by user code (needs `@sprout/jsx`).
 *
 * M10 pins every `@sprout/*` import to `0.2.0`; release automation
 * bumps the patch version on every release. Tasks delegate to the
 * pinned `jsr:@sprout/cli@0.2.0` binary.
 */
export const TEMPLATE_DENO_JSONC = `{
  "tasks": {
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --allow-run @sprout/cli dev",
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --allow-run @sprout/cli build",
    "serve": "deno run --allow-read --allow-env --allow-net @sprout/cli serve"
  },
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@sprout/jsx"
  },
  "imports": {
    "@sprout/core": "jsr:@sprout/core@0.2.0",
    "@sprout/config": "jsr:@sprout/config@0.2.0",
    "@sprout/compiler": "jsr:@sprout/compiler@0.2.0",
    "@sprout/jsx": "jsr:@sprout/jsx@0.2.0",
    "@sprout/jsx/dom": "jsr:@sprout/jsx@0.2.0/dom",
    "@sprout/jsx/dom/jsx-runtime": "jsr:@sprout/jsx@0.2.0/dom/jsx-runtime",
    "@sprout/jsx/dom/jsx-dev-runtime": "jsr:@sprout/jsx@0.2.0/dom/jsx-dev-runtime",
    "@sprout/runtime": "jsr:@sprout/runtime@0.2.0",
    "@sprout/utils": "jsr:@sprout/utils@0.2.0"
  }
}
`;

/** `sprout.config.ts` for a generated project. */
export const TEMPLATE_SPROUT_CONFIG_TS = `import { defineConfig } from "@sprout/core";

export default defineConfig({
  root: ".",
});
`;

/** `src/routes/index.tsx` for a generated project. */
export const TEMPLATE_ROUTES_INDEX_TSX = `import type { JSX } from "@sprout/core";
import Counter from "../islands/Counter.tsx";

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Hello, Sprout!</h1>
      <Counter initial={1} />
    </main>
  );
}
`;

/** `src/islands/Counter.tsx` for a generated project. */
export const TEMPLATE_ISLANDS_COUNTER_TSX = `import type { JSX } from "@sprout/core";

export type CounterProps = {
  readonly initial: number;
};

let nextCounterId = 0;

export default function Counter(props: CounterProps): JSX.Element {
  const id = "sprout-counter-" + nextCounterId++;
  let count = props.initial;

  queueMicrotask(() => {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener("click", () => {
      count += 1;
      button.textContent = "Count: " + count;
    });
  });

  return <button id={id} type="button">Count: {count}</button>;
}
`;

/** `src/styles/app.css` for a generated project. */
export const TEMPLATE_STYLES_APP_CSS = `:root {
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  padding: 1.5rem;
}
`;

/** `public/.gitkeep` for a generated project. Empty by design. */
export const TEMPLATE_PUBLIC_GITKEEP = "";

/**
 * The list of files `runInit` writes. The order is the order they
 * appear on disk; the test asserts on this exact set.
 */
export const INIT_FILES: readonly { readonly relPath: string; readonly content: string }[] = [
  { relPath: "deno.jsonc", content: TEMPLATE_DENO_JSONC },
  { relPath: "sprout.config.ts", content: TEMPLATE_SPROUT_CONFIG_TS },
  { relPath: "src/routes/index.tsx", content: TEMPLATE_ROUTES_INDEX_TSX },
  { relPath: "src/islands/Counter.tsx", content: TEMPLATE_ISLANDS_COUNTER_TSX },
  { relPath: "src/styles/app.css", content: TEMPLATE_STYLES_APP_CSS },
  { relPath: "public/.gitkeep", content: TEMPLATE_PUBLIC_GITKEEP },
];

/** The set of relpaths `runInit` is allowed to create or overwrite. */
export const INIT_FILE_RELPATHS: ReadonlySet<string> = new Set(
  INIT_FILES.map((f) => f.relPath),
);
