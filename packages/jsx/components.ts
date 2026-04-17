// components.ts - Component type definitions
import type { Child } from "@hono/hono/jsx";

export type FC<P = Record<string, unknown>> = (
  props: P & { children?: Child },
) => Child;
export type PropsWithChildren<P = Record<string, unknown>> = P & {
  children?: Child;
};
