import type { PageComponent } from "@ggpwnkthx/sprout";
import Counter from "../islands/Counter.tsx";

const Home: PageComponent = () => (
  <main>
    <h1>🌱 Interactive Islands</h1>
    <p>Click the counter below — it runs entirely in the browser.</p>
    <Counter />
  </main>
);

export default Home;
