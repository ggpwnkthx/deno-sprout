// The home route of the basic example. One page, one island.
import type { JSX } from "@sprout/jsx";
import Counter from "../islands/Counter.tsx";

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Hello, Sprout!</h1>
      <Counter initial={1} />
    </main>
  );
}
