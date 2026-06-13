// A dynamic blog-post route. The `[slug]` segment is captured and
// exposed as `props.params.slug`. The page just echoes the slug
// so the reader can see the value in the browser.
import type { JSX, PageProps } from "@sprout/core";

export default function Post(props: PageProps<{ slug: string }>): JSX.Element {
  return (
    <main>
      <h1>Post: {props.params.slug}</h1>
      <p>
        This is a dynamic route. The URL segment after
        <code>/blog/</code> is captured into <code>props.params.slug</code>.
      </p>
      <p>
        <a href="/">Back home</a>
      </p>
    </main>
  );
}
