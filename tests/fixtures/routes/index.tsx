import type { PageComponent } from "@ggpwnkthx/sprout";
import LikeButton from "../islands/LikeButton.tsx";

const Home: PageComponent = () => (
  <main>
    <h1>🌱 Welcome to Sprout</h1>
    <p>
      Edit <code>routes/index.tsx</code> to get started.
    </p>
    <LikeButton />
  </main>
);

export default Home;
