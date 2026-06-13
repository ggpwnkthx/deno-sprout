// The home route. A landing page that links to the dynamic,
// catch-all, and route-group examples so the reader can navigate
// to each one.
import type { JSX } from "@sprout/jsx";

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Sprout nested routes</h1>
      <ul>
        <li>
          <a href="/blog/hello-world">/blog/:slug — a dynamic route</a>
        </li>
        <li>
          <a href="/files/docs/readme.txt">/files/:path — a catch-all route</a>
        </li>
        <li>
          <a href="/about">/about — a route group, marketing segment dropped</a>
        </li>
        <li>
          <a href="/careers">/careers — another route group, also dropped</a>
        </li>
      </ul>
    </main>
  );
}
