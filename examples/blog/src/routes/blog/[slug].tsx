// The post detail route. The dynamic segment `[slug]` is exposed
// as `props.params.slug`. The page reads the post from the in-memory
// data layer and renders its title, date, and body. A LikeButton
// island sits under the body to demonstrate props flowing from the
// server-rendered page metadata into a client-side island.
import type { JSX, PageProps } from "@sprout/core";
import { findPost } from "../../data.ts";
import LikeButton from "../../islands/LikeButton.tsx";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export default function Post(props: PageProps<{ slug: string }>): JSX.Element {
  const post = findPost(props.params.slug);
  if (post === null) {
    return (
      <main>
        <h1>Not found</h1>
        <p>No post with slug "{props.params.slug}".</p>
      </main>
    );
  }
  return (
    <main>
      <article>
        <h1>{post.title}</h1>
        <p>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
        </p>
        <p>{post.body}</p>
        <LikeButton initial={post.likes} slug={post.slug} />
      </article>
    </main>
  );
}
