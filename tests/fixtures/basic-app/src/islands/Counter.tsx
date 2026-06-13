import type { JSX } from "@sprout/jsx";

export default function Counter(props: { initial: number }): JSX.Element {
  return <button type="button">Count: {props.initial}</button>;
}
