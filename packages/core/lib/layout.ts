// lib/layout.ts - Layout helpers and layout chain composition
import type { LayoutComponent } from "../types.ts";
import { Fragment } from "@hono/hono/jsx";
import { toFileUrl } from "@std/path";
import type { RouteModule } from "@ggpwnkthx/sprout-router/fs";
import type { Child } from "@hono/hono/jsx";

// Fragment is the <>...</> wrapper; using it avoids JSX-in-.ts parsing issues.
const IDENTITY_LAYOUT: LayoutComponent = ({ children }) =>
  Fragment({ children });

/**
 * Resolve a layout chain into a single LayoutComponent.
 *
 * Layouts whose realPath cannot be resolved (file deleted, permission denied)
 * or whose realPath escapes `rootReal` are silently skipped. This is intentional
 * for deploy-mode manifests: fail-open prevents a broken layout file from crashing
 * the entire request; the page renders without the unavailable layout wrapper.
 *
 * When `rootReal` is not provided, only ".." segment filtering is applied —
 * absolute paths like "/etc/passwd" are NOT rejected. Callers must ensure
 * manifests originate from a trusted build step.
 *
 * @param layoutChain - Ordered list of layout file paths
 * @param fallbackLayout - Layout to use when chain is empty
 * @param rootReal - Project root real path for containment checks
 * @param sep - OS path separator
 * @param signal - Optional abort signal to bound import time (e.g. `AbortSignal.timeout(5000)`)
 */
export async function composeLayouts(
  layoutChain: string[],
  fallbackLayout?: LayoutComponent,
  rootReal?: string,
  sep?: string,
  signal?: AbortSignal,
): Promise<LayoutComponent> {
  if (layoutChain.length === 0) {
    return fallbackLayout ?? IDENTITY_LAYOUT;
  }

  // Validate each layout path before importing. If rootReal is provided,
  // the resolved path must be within rootReal. This prevents a malicious
  // manifest from injecting layout files outside the project tree.
  let validPaths: string[];
  if (rootReal && sep) {
    // Batch all realPath calls in parallel, then filter by containment.
    const results = await Promise.all(
      layoutChain.map((f) => Deno.realPath(f).catch(() => null)),
    );
    validPaths = results
      .map((absReal) =>
        absReal &&
          (absReal === rootReal || absReal.startsWith(rootReal + sep))
          ? absReal
          : null
      )
      .filter((p): p is string => p !== null);
  } else {
    // No root provided: reject ".." segments as a safety fallback.
    validPaths = layoutChain.filter((f) => !f.includes(".."));
  }

  if (validPaths.length === 0) {
    return fallbackLayout ?? IDENTITY_LAYOUT;
  }

  // Race layout imports against the abort signal to bound init time.
  // If the signal fires, the promise rejects, propagating the abort error upward.
  const importPromise = Promise.all(
    validPaths.map((filePath) => import(String(toFileUrl(filePath)))),
  );
  let modules: RouteModule["default"][];
  if (signal) {
    modules = await Promise.race([
      importPromise,
      new Promise<typeof modules>((_, reject) => {
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        });
      }),
    ]);
  } else {
    modules = await importPromise;
  }

  return modules.reduceRight<LayoutComponent>(
    (inner, mod) => {
      const modLayout = mod as (props: Record<string, unknown>) => Child;
      if (!modLayout) return inner;
      return ({ children }) => modLayout({ children });
    },
    fallbackLayout ?? IDENTITY_LAYOUT,
  );
}

/**
 * Declare a layout component with explicit typing.
 *
 * This is an identity function — it returns the component unchanged at runtime.
 * The sole purpose is to make the layout intent explicit in the code and
 * allow consumers to import the `LayoutComponent` type without importing from
 * the main types module.
 *
 * @example
 * ```tsx
 * import { defineLayout } from "@ggpwnkthx/sprout-core/lib/layout";
 *
 * const layout = defineLayout(function MyLayout({ children }) {
 *   return (
 *     <div class="page-wrapper">
 *       <nav>...</nav>
 *       <main>{children}</main>
 *     </div>
 *   );
 * });
 *
 * export { layout };
 * ```
 */
export const defineLayout = (component: LayoutComponent): LayoutComponent => {
  return component;
};

export type { LayoutComponent };
