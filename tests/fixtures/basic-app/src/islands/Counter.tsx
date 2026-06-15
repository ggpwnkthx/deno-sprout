import type { JSX } from "@sprout/jsx";

let nextCounterId = 0;

export default function Counter(props: { initial: number }): JSX.Element {
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
