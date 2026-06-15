// The Counter island. Same shape as the basic example, here used
// to show that a server-supplied prop flows through the placeholder
// to the client-side component.
import type { JSX } from "@sprout/jsx";

export type CounterProps = {
  readonly initial: number;
};

let nextCounterId = 0;

export default function Counter(props: CounterProps): JSX.Element {
  const id = "sprout-counter-" + nextCounterId++;
  let count = props.initial;

  queueMicrotask(() => {
    const button = document.getElementById(id);
    if (!(button instanceof HTMLButtonElement)) return;
    button.addEventListener("click", () => {
      count += 1;
      button.textContent = "Count: " + count;
    });
  });

  return <button id={id} type="button">Count: {count}</button>;
}
