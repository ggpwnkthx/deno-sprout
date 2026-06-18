// Browser runtime entry compiled to `/@sprout/runtime.js`.
//
// The HTML shell includes this module on every rendered page. It waits
// until the document is ready, then asks `@sprout/runtime` to mount every
// island placeholder in document order. This file is the canonical
// browser-side entry point; it is bundled as `/@sprout/runtime.js`
// by both the dev and production pipelines.
//
// This file lives in `@sprout/runtime` because it is a runtime concern
// (mounting browser islands), not a compiler concern.
import { mountAll } from "./mount_all.ts";
import { scheduleMount } from "./entry_bootstrap.ts";

let started = false;

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

  scheduleMount(
    typeof document !== "undefined" ? document : undefined,
    root,
    run,
  );
}

start();
