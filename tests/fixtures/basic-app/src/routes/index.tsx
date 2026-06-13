import type { JSX } from "@sprout/jsx";
import Counter from "../islands/Counter.tsx";

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>hi</h1>
      <Counter initial={7} />
    </main>
  );
}
