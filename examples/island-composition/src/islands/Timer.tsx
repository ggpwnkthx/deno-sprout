// The Timer island. A client-side clock that ticks once per
// second. The island has no server props; everything is computed
// on the client after mount.
import type { JSX } from "@sprout/jsx";

export default function Timer(): JSX.Element {
  queueMicrotask(() => {
    const target = document.querySelector<HTMLElement>('[data-testid="timer"]');
    if (target === null) return;

    const update = (): void => {
      target.textContent = new Date().toLocaleTimeString();
    };
    update();
    setInterval(update, 1000);
  });

  return (
    <p>
      <time data-testid="timer">--:--:--</time>
    </p>
  );
}
