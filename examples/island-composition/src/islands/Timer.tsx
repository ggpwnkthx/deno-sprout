// The Timer island. A client-side clock that ticks once per
// second. The island has no server props; everything is computed
// on the client after mount.
import type { JSX } from "@sprout/jsx";

export default function Timer(): JSX.Element {
  return (
    <p>
      <time data-testid="timer">--:--:--</time>
    </p>
  );
}
