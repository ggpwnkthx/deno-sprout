import type { LayoutComponent } from "@ggpwnkthx/sprout";

const BlogLayout: LayoutComponent = ({ children }) => (
  <div>
    <nav>
      <a href="/blog">Blog</a>
      <a href="/">Home</a>
    </nav>
    <main>{children}</main>
  </div>
);

export default BlogLayout;
