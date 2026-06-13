// The home route. Renders a list of post titles with their
// publication dates; each title links to the post's detail page.
import type { JSX } from "@sprout/jsx";
import { POSTS } from "../data.ts";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Sprout Blog</h1>
      <ul>
        {POSTS.map((post) => (
          <li key={post.slug}>
            <a href={`/blog/${post.slug}`}>{post.title}</a>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
          </li>
        ))}
      </ul>
    </main>
  );
}
