import type { PageComponent } from "@ggpwnkthx/sprout";
import { Island } from "@ggpwnkthx/sprout-islands";
import LikeButton from "../islands/LikeButton.tsx";
import InteractiveCounter from "../islands/InteractiveCounter.tsx";

const Home: PageComponent = () => (
  <main>
    <h1>🌱 Welcome to Sprout</h1>
    <p>
      Edit <code>routes/index.tsx</code> to get started.
    </p>
    <LikeButton />
    <Island
      name="InteractiveCounter"
      component={InteractiveCounter}
      props={{}}
    />
  </main>
);

export default Home;
