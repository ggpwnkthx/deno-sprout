// lib/props.ts - Props validation helpers
export function validateProps(props: unknown): boolean {
  return typeof props === "object" && props !== null;
}
