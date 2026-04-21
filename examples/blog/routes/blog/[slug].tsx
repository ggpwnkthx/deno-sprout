import type { Context } from "@hono/hono";
import type { PageComponent } from "@ggpwnkthx/sprout";

// Data loader — runs server-side before the page renders.
// The return value flows into props.data on the client.
export function handler(c: Context) {
  const slug = c.req.param("slug");
  // In a real app, fetch from a database
  return { post: { slug, title: `Post: ${slug}`, body: "Hello world." } };
}

const Post: PageComponent<{ post: { title: string; body: string } }> = ({
  data,
}) => (
  <article>
    <h1>{data.post.title}</h1>
    <p>{data.post.body}</p>
  </article>
);

export default Post;
