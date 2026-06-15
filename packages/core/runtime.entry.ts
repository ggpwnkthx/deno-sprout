// Compatibility browser runtime entry for `@sprout/core`.
//
// The compiler now owns the asset entry it bundles for
// `/@sprout/runtime.js`, but this file remains as a non-public package
// file for older callers that may have imported the M3/M4 subpath
// directly. Keep it behaviorally identical to the compiler entry.
import { mountAll } from "@sprout/runtime";

let started = false;

/** Start the browser island mount loop once. */
export function start(root?: ParentNode | null): void {
  if (started) {
    return;
  }
  if ((root === undefined || root === null) && typeof document === "undefined") {
    return;
  }

  started = true;
  const run = (): void => {
    void mountAll(root ?? undefined).catch((cause) => {
      console.error("[sprout] runtime mount failed", cause);
    });
  };

  if (
    (root === undefined || root === null) &&
    typeof document !== "undefined" &&
    document.readyState === "loading"
  ) {
    document.addEventListener("DOMContentLoaded", run, { once: true });
    return;
  }

  queueMicrotask(run);
}

start();
