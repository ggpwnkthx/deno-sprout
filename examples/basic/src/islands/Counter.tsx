// The Counter island. The canonical "default-exported component"
// shape: a typed `props` parameter, a single default export, and
// no registration.
import type { JSX } from "@sprout/jsx";

export type CounterProps = {
  readonly initial: number;
};

export default function Counter(props: CounterProps): JSX.Element {
  return <button type="button">Count: {props.initial}</button>;
}
