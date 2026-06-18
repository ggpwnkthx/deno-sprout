// `mountAll`: scan a root for placeholder elements and mount each one.
//
// Behavior matches the spec in `docs/sprout/packages/runtime.md`:
//   - skip nodes with `data-sprout-mounted="true"`;
//   - mount in document order;
//   - continue past per-node failures;
//   - return one structured `IslandMountResult` per element scanned;
//   - log failures with a `[sprout]` prefix.
import { RuntimeError } from "./errors.ts";
import { mountIsland } from "./mount_island.ts";
import type { IslandMountResult } from "./module_contract.ts";
import type { MountIslandOptions } from "./mount_island.ts";

/**
 * Scan a `ParentNode` for island placeholders and mount each one.
 *
 * If `root` is omitted, the function falls back to `document` in
 * browser environments and throws `MOUNT_FAILED` in non-browser hosts.
 */
export async function mountAll(
  root?: ParentNode | null,
  options: MountIslandOptions = {},
): Promise<readonly IslandMountResult[]> {
  const target = root ?? defaultRoot();
  const nodes = Array.from(target.querySelectorAll("[data-sprout-src]"));
  const results: IslandMountResult[] = [];

  const promises = nodes.map(async (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute("data-sprout-mounted") === "true") {
      const id = element.getAttribute("data-sprout-island") ?? "";
      const src = element.getAttribute("data-sprout-src") ?? "";
      return { ok: true, id, src, element } as const;
    }
    return await mountIsland(element, options);
  });

  // All dynamic imports are started in parallel (network is the bottleneck);
  // the for-loop just collects results into the `results` array in document
  // order so callers see a stable, ordered report.
  for (let i = 0; i < promises.length; i++) {
    const promise = promises[i]!;
    const result = await promise;
    if (!result.ok) {
      console.error("[sprout] mount failed for", result.id, result.src, result.error);
    }
    results.push(result);
  }

  return results;
}

function defaultRoot(): ParentNode {
  // The `document` global is provided by the DOM lib in the workspace
  // config. We do a `typeof` check so this module is safe to import
  // in non-browser test runners.
  if (typeof document !== "undefined") {
    return document as ParentNode;
  }
  throw new RuntimeError("MOUNT_FAILED", "no document available for mountAll");
}
