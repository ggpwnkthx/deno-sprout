// Public types for the browser-only mount loop.
//
// These types describe the contract between generated island bundles,
// generated wrappers, and the runtime entry. They are the source of
// truth for the cross-package shape.
import type { RuntimeError } from "@sprout/jsx/shared";

/**
 * The default export shape of a compiled island bundle.
 *
 * The runtime dynamic-imports the module, reads `module.default.mount`,
 * and invokes it with the placeholder element and the validated props.
 */
export type IslandClientModule = {
  readonly mount: (
    element: HTMLElement,
    props: Readonly<Record<string, unknown>>,
  ) => void | Promise<void>;
};

/**
 * Structured result of a single `mountIsland` (or `mountAll`) call.
 *
 * On success: `{ ok: true, id, src, element }`.
 * On failure: `{ ok: false, id, src, element, error }`.
 */
export type IslandMountResult =
  | {
    readonly ok: true;
    readonly id: string;
    readonly src: string;
    readonly element: HTMLElement;
  }
  | {
    readonly ok: false;
    readonly id: string;
    readonly src: string;
    readonly element: HTMLElement;
    readonly error: RuntimeError;
  };

/**
 * The shape generated wrappers use to mount a single component into
 * an element. The runtime owns element clearing, error wrapping, and
 * the `data-sprout-mounted` marker; the wrapper supplies the component
 * constructor and the props.
 */
export type MountComponent = <Props extends Record<string, unknown>>(
  element: HTMLElement,
  Component: (props: Readonly<Props>) => unknown,
  props: Readonly<Record<string, unknown>>,
) => void;
