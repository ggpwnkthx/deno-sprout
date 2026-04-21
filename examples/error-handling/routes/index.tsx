import type { PageComponent } from "@ggpwnkthx/sprout";

const Home: PageComponent = () => (
  <main>
    <h1>🌱 Error Handling Demo</h1>
    <ul>
      <li>
        <a href="/nonexistent">Visit a 404 page</a>
      </li>
      <li>
        <a href="/throw">Trigger a 500 error</a>
      </li>
    </ul>
  </main>
);

export default Home;
