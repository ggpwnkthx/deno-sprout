// @ggpwnkthx/sprout-islands
// Island hydration, signals, and client-side reactivity

export { batch, computed, effect, signal } from "./signals.ts";
export type { EffectHandle, ReadonlySignal, Signal } from "./signals.ts";
export { Island } from "./hydrator.ts";
export type { HydrationStrategy, IslandProps } from "./hydrator.ts";
export { deserializeProps, serializeProps } from "./serializer.ts";
export { useComputed, useEffect, useSignal } from "./hooks.ts";
export { mount } from "./lib/mount.ts";
export { generateIslandWrapper } from "./lib/wrapper-template.ts";
