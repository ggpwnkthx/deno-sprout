// The blog example's data layer. A tiny in-memory list of posts.
//
// In a real app this would be a database, a CMS, or a static file
// generator; for the M9 example the source of truth is a literal
// array. The list has three posts; the date strings are ISO-8601
// so `Intl.DateTimeFormat` parses them without surprises.
export type Post = {
  readonly slug: string;
  readonly title: string;
  readonly date: string; // ISO date
  readonly body: string; // markdown-ish prose
  readonly likes: number;
};

export const POSTS: readonly Post[] = [
  {
    slug: "hello-sprout",
    title: "Hello, Sprout!",
    date: "2024-08-12",
    body:
      "Welcome to the blog example. This post is the canonical 'first post' for the example app.",
    likes: 12,
  },
  {
    slug: "islands-explained",
    title: "Islands, explained",
    date: "2024-09-03",
    body:
      "An island is a small piece of client-side interactivity inside a server-rendered page. The framework owns the mount loop; you write a default-exported component.",
    likes: 4,
  },
  {
    slug: "build-and-serve",
    title: "Build and serve, in production",
    date: "2024-10-21",
    body:
      "The production pipeline writes content-hashed assets and a frozen manifest. The serve step reads the manifest once at startup and serves the assets with ETag, gzip, and immutable cache headers.",
    likes: 9,
  },
];

/** Look up a post by its slug. Returns `null` if no post matches. */
export function findPost(slug: string): Post | null {
  for (const post of POSTS) {
    if (post.slug === slug) return post;
  }
  return null;
}
