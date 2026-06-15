// The Counter island. The canonical "default-exported component"
// shape: a typed `props` parameter, a single default export, and
// no registration.
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
