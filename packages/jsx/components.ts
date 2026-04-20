import type { Child } from "@hono/hono/jsx";

/**
 * Component type representing a function that receives props and returns JSX
 * children.
 *
 * @template P - The props type for the component. Defaults to a generic object
 *   record to allow any property shape.
 */
export type FC<P = Record<string, unknown>> = (
  props: P & { children?: Child },
) => Child;

/**
 * Helper type that merges the props type `P` with an optional `children` field.
 * Use this as a shorthand when defining component prop types that need to
 * accept child elements.
 *
 * @template P - The base props type that does not yet include `children`.
 *
 * @example
 * ```tsx
 * interface ButtonProps {
 *   variant: "primary" | "secondary";
 * }
 *
 * const Button: FC<PropsWithChildren<ButtonProps>> = ({
 *   variant,
 *   children,
 * }) => (
 *   <button class={`btn btn-${variant}`}>{children}</button>
 * );
 * ```
 */
export type PropsWithChildren<P = Record<string, unknown>> = P & {
  children?: Child;
};
