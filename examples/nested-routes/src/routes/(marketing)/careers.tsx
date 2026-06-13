// A second route group example. The `(marketing)` segment is
// dropped from the URL, so this file also lives at `/careers`,
// not `/marketing/careers`.
import type { JSX } from "@sprout/jsx";

export default function Careers(): JSX.Element {
  return (
    <main>
      <h1>Careers</h1>
      <p>
        This page is at <code>/careers</code>. It is in the same
        <code>(marketing)</code>{" "}
        route group as the about page; both segments are dropped from the URL.
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </main>
  );
}
