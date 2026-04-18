// index.tsx - Route with an Island component
import { Island } from "@ggpwnkthx/sprout-islands/hydrator";
import Counter from "../islands/Counter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Islands Demo</h1>
      <Island name="Counter" component={Counter} props={{ initialCount: 0 }} />
    </main>
  );
}
