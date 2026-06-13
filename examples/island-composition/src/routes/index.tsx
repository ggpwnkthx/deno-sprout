// The home route. Renders three islands side-by-side: a Counter
// (props from the server), a Timer (no props, fully client-side),
// and a ThemeToggle (no props, persists to localStorage). The
// route also reads the `theme` query string to seed the initial
// `data-theme` attribute on the html element.
import type { JSX } from "@sprout/jsx";
import Counter from "../islands/Counter.tsx";
import Timer from "../islands/Timer.tsx";
import ThemeToggle from "../islands/ThemeToggle.tsx";

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Three islands</h1>
      <section>
        <h2>Counter</h2>
        <p>
          An island whose <code>initial</code> prop comes from the server.
        </p>
        <Counter initial={3} />
      </section>
      <section>
        <h2>Timer</h2>
        <p>An island that ticks once per second. No server props.</p>
        <Timer />
      </section>
      <section>
        <h2>Theme toggle</h2>
        <p>
          An island that toggles the <code>data-theme</code> attribute on the{" "}
          <code>&lt;html&gt;</code> element and persists the choice in
          <code>localStorage</code>.
        </p>
        <ThemeToggle />
      </section>
    </main>
  );
}
