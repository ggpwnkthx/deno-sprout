// The blog index. Same list view as the home route, in case the
// reader navigates to /blog directly.
import type { JSX } from "@sprout/jsx";
import { POSTS } from "../../data.ts";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export default function BlogIndex(): JSX.Element {
  return (
    <main>
      <h1>All posts</h1>
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
