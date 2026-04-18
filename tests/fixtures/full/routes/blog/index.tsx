import type { PageComponent } from "@ggpwnkthx/sprout";

const posts = [
  { slug: "hello-world", title: "Hello World" },
  { slug: "getting-started", title: "Getting Started" },
];

const BlogIndex: PageComponent = () => (
  <div>
    <h1>Blog</h1>
    <ul>
      {posts.map((post) => (
        <li key={post.slug}>
          <a href={`/blog/${post.slug}`}>{post.title}</a>
        </li>
      ))}
    </ul>
  </div>
);

export default BlogIndex;
