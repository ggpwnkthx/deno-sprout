// A catch-all route. The `[...path]` segment is captured as the
// rest of the URL path. The framework's pattern for this segment
// is `:path{.+}` so it only matches a non-empty remainder.
//
// Note: the M3 server translates the manifest pattern
// `/files/:path{.+}` to the Hono pattern `/files/:path`, which
// matches a single path segment. The catch-all is therefore
// scoped to a single segment in the M3 release. A future
// milestone can revisit the translation strategy.
import type { JSX } from "@sprout/jsx";
import type { PageProps } from "@sprout/core";

export default function Files(
  props: PageProps<{ path: string }>,
): JSX.Element {
  return (
    <main>
      <h1>Files: {props.params.path}</h1>
      <p>
        This is a catch-all route. The path after
        <code>/files/</code> is captured into <code>props.params.path</code>.
      </p>
      <p>
        Try <a href="/files/readme.txt">/files/readme.txt</a> or{" "}
        <a href="/files/notes.md">/files/notes.md</a>.
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </main>
  );
}
