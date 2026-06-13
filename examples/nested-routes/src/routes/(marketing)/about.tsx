// A route group. The `(marketing)` segment is dropped from the
// URL pattern, so this file maps to `/about`, not `/marketing/about`.
// The segment exists only to organize files on disk.
import type { JSX } from "@sprout/jsx";

export default function About(): JSX.Element {
  return (
    <main>
      <h1>About us</h1>
      <p>
        This page is at <code>/about</code>, but the file is at
        <code>src/routes/(marketing)/about.tsx</code>. The
        <code>(marketing)</code> segment is a route group — it is dropped from the URL.
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </main>
  );
}
