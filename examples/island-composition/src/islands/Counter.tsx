// The Counter island. Same shape as the basic example, here used
// to show that a server-supplied prop flows through the placeholder
// to the client-side component.
import type { JSX } from "@sprout/jsx";

export type CounterProps = {
  readonly initial: number;
};

export default function Counter(props: CounterProps): JSX.Element {
  return <button type="button">Count: {props.initial}</button>;
}
