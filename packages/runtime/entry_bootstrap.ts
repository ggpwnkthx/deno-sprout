/**
 * Minimal DOM surface required by the runtime bootstrap. Lets tests
 * pass a fake without standing up a full Document.
 */
export interface MinimalDocument {
  readonly readyState: string;
  addEventListener(
    type: string,
    listener: () => void,
    options?: { once?: boolean },
  ): void;
}

/**
 * Path chosen by `scheduleMount`. Returned for testability and
 * diagnostics; consumers may ignore it.
 */
export type SchedulePath = "microtask" | "domcontentloaded" | "noop";

/**
 * Decide when and how to invoke `run` based on `doc` and `root`.
 *
 *   - If `root` is supplied, schedule via `queueMicrotask`.
 *   - If `doc` is undefined and `root` is missing, do nothing (no-op).
 *   - If `doc.readyState === "loading"`, schedule via
 *     `doc.addEventListener("DOMContentLoaded", run, { once: true })`.
 *   - Otherwise schedule via `queueMicrotask`.
 *
 * Returns the path taken. Pure: does not touch module-scoped state.
 */
export function scheduleMount(
  doc: MinimalDocument | undefined,
  root: ParentNode | null | undefined,
  run: () => void,
): SchedulePath {
  if (root !== undefined && root !== null) {
    queueMicrotask(run);
    return "microtask";
  }
  if (doc === undefined) {
    return "noop";
  }
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run, { once: true });
    return "domcontentloaded";
  }
  queueMicrotask(run);
  return "microtask";
}
