// template.ts - Template rendering and project scaffolding
import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";

// ── Types ────────────────────────────────────────────────────────────────────

export type TemplateName = "minimal" | "blog" | "api";

export interface ProjectFile {
  /** Relative path within the new project. */
  path: string;
  /** File contents. */
  content: string;
}

export interface Template {
  name: TemplateName;
  description: string;
  files: ProjectFile[];
}

export interface InitOptions {
  /** Project directory name / path. Prompted interactively if not provided. */
  name?: string;
  /** Template to use. Default: "minimal" */
  template?: TemplateName;
  /** Suppress prompts - use defaults for all missing options. */
  yes?: boolean;
}

// ── SPROUT_IMPORT (Task 9 - SPROUT_LOCAL) ────────────────────────────────────

const SPROUT_IMPORT = Deno.env.get("SPROUT_LOCAL") === "1"
  ? "../packages/sprout"
  : "jsr:@ggpwnkthx/sprout@^0.1.0";

// ── Common shared file content ────────────────────────────────────────────────

const MAIN_TS = `import { createApp } from "@ggpwnkthx/sprout";
const app = await createApp();
Deno.serve(app.fetch);
`;

const ROUTES_LAYOUT_TSX =
  `import type { LayoutComponent } from "@ggpwnkthx/sprout";

const Layout: LayoutComponent = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>My Sprout App</title>
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body>
      {children}
      <script type="module" src="/_sprout/hydrate.js" />
    </body>
  </html>
);

export default Layout;
`;

const ROUTES_INDEX_TSX =
  `import type { PageComponent } from "@ggpwnkthx/sprout";

const Home: PageComponent = () => (
  <main>
    <h1>🌱 Welcome to Sprout</h1>
    <p>
      Edit <code>routes/index.tsx</code> to get started.
    </p>
  </main>
);

export default Home;
`;

const ISLANDS_GITKEEP = "";
const STATIC_GITKEEP = "";

// ── Minimal template ─────────────────────────────────────────────────────────

const MINIMAL_TEMPLATE: Template = {
  name: "minimal",
  description: "A minimal Sprout application",
  files: [
    {
      path: "deno.json",
      content: JSON.stringify(
        {
          imports: {
            "@ggpwnkthx/sprout": SPROUT_IMPORT,
          },
          tasks: {
            dev: "deno run -A jsr:@ggpwnkthx/sprout/dev",
            build: "deno run -A jsr:@ggpwnkthx/sprout/build",
            check: "deno check routes/**/*.tsx islands/**/*.tsx main.ts",
          },
          compilerOptions: {
            jsx: "react-jsx",
            jsxImportSource: "@hono/hono",
          },
        },
        null,
        2,
      ),
    },
    { path: "main.ts", content: MAIN_TS },
    { path: "routes/_layout.tsx", content: ROUTES_LAYOUT_TSX },
    { path: "routes/index.tsx", content: ROUTES_INDEX_TSX },
    { path: "islands/.gitkeep", content: ISLANDS_GITKEEP },
    { path: "static/.gitkeep", content: STATIC_GITKEEP },
  ],
};

// ── Blog template ─────────────────────────────────────────────────────────────

const BLOG_LAYOUT_TSX =
  `import type { LayoutComponent } from "@ggpwnkthx/sprout";

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
`;

const BLOG_INDEX_TSX = `import type { PageComponent } from "@ggpwnkthx/sprout";

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
          <a href={\`/blog/\${post.slug}\`}>{post.title}</a>
        </li>
      ))}
    </ul>
  </div>
);

export default BlogIndex;
`;

const BLOG_SLUG_TSX = `import type { PageComponent } from "@ggpwnkthx/sprout";

// Fake data loader
export function handler(c) {
  const slug = c.req.param("slug");
  // In a real app, fetch from a database
  c.set("post", { slug, title: \`Post: \${slug}\`, body: "Hello world." });
}

const Post: PageComponent<{ post: { title: string; body: string } }> = (
  { data },
) => (
  <article>
    <h1>{data.post.title}</h1>
    <p>{data.post.body}</p>
  </article>
);

export default Post;
`;

const LIKE_BUTTON_TSX = `import { signal } from "@preact/signals";

export default function LikeButton() {
  const count = signal(0);

  return (
    <button type="button" onClick={() => count.value++}>
      ❤️ {count.value}
    </button>
  );
}
`;

const STYLES_CSS = `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #333;
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

a {
  color: #0066cc;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

nav {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 1rem;
}

h1 {
  margin-bottom: 0.5rem;
}

p {
  margin-bottom: 1rem;
}

ul {
  list-style: none;
  padding: 0;
}

li {
  padding: 0.25rem 0;
}
`;

const BLOG_TEMPLATE: Template = {
  name: "blog",
  description: "A blog with posts and interactive islands",
  files: [
    {
      path: "deno.json",
      content: JSON.stringify(
        {
          imports: {
            "@ggpwnkthx/sprout": SPROUT_IMPORT,
          },
          tasks: {
            dev: "deno run -A jsr:@ggpwnkthx/sprout/dev",
            build: "deno run -A jsr:@ggpwnkthx/sprout/build",
            check: "deno check routes/**/*.tsx islands/**/*.tsx main.ts",
          },
          compilerOptions: {
            jsx: "react-jsx",
            jsxImportSource: "@hono/hono",
          },
        },
        null,
        2,
      ),
    },
    { path: "main.ts", content: MAIN_TS },
    { path: "routes/_layout.tsx", content: ROUTES_LAYOUT_TSX },
    { path: "routes/index.tsx", content: ROUTES_INDEX_TSX },
    { path: "islands/.gitkeep", content: ISLANDS_GITKEEP },
    { path: "static/.gitkeep", content: STATIC_GITKEEP },
    { path: "routes/blog/_layout.tsx", content: BLOG_LAYOUT_TSX },
    { path: "routes/blog/index.tsx", content: BLOG_INDEX_TSX },
    { path: "routes/blog/[slug].tsx", content: BLOG_SLUG_TSX },
    { path: "islands/LikeButton.tsx", content: LIKE_BUTTON_TSX },
    { path: "static/styles.css", content: STYLES_CSS },
  ],
};

// ── API template ─────────────────────────────────────────────────────────────

const API_ITEMS_TS = `import type { Handler } from "@ggpwnkthx/sprout";

const items: { id: number; name: string }[] = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

export const GET: Handler = (c) => c.json(items);

export const POST: Handler = async (c) => {
  const body = await c.req.json();
  const newItem = { id: items.length + 1, name: body.name };
  items.push(newItem);
  return c.json(newItem, 201);
};
`;

const API_ITEM_ID_TS = `import type { Handler } from "@ggpwnkthx/sprout";

const items: { id: number; name: string }[] = [
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
];

export const GET: Handler = (c) => {
  const id = Number(c.req.param("id"));
  const item = items.find((i) => i.id === id);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
};

export const PUT: Handler = async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return c.json({ error: "Not found" }, 404);
  items[index] = { id, name: body.name };
  return c.json(items[index]);
};

export const DELETE: Handler = (c) => {
  const id = Number(c.req.param("id"));
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return c.json({ error: "Not found" }, 404);
  items.splice(index, 1);
  return c.json({ success: true });
};
`;

const API_TEMPLATE: Template = {
  name: "api",
  description: "A REST API with typed method handlers",
  files: [
    {
      path: "deno.json",
      content: JSON.stringify(
        {
          imports: {
            "@ggpwnkthx/sprout": SPROUT_IMPORT,
          },
          tasks: {
            dev: "deno run -A jsr:@ggpwnkthx/sprout/dev",
            build: "deno run -A jsr:@ggpwnkthx/sprout/build",
            check: "deno check routes/**/*.tsx islands/**/*.tsx main.ts",
          },
          compilerOptions: {
            jsx: "react-jsx",
            jsxImportSource: "@hono/hono",
          },
        },
        null,
        2,
      ),
    },
    { path: "main.ts", content: MAIN_TS },
    { path: "routes/_layout.tsx", content: ROUTES_LAYOUT_TSX },
    { path: "routes/index.tsx", content: ROUTES_INDEX_TSX },
    { path: "islands/.gitkeep", content: ISLANDS_GITKEEP },
    { path: "static/.gitkeep", content: STATIC_GITKEEP },
    { path: "routes/api/items.ts", content: API_ITEMS_TS },
    { path: "routes/api/items/[id].ts", content: API_ITEM_ID_TS },
  ],
};

// ── Template registry ────────────────────────────────────────────────────────

export const TEMPLATES: Record<TemplateName, Template> = {
  minimal: MINIMAL_TEMPLATE,
  blog: BLOG_TEMPLATE,
  api: API_TEMPLATE,
};

// ── Core scaffolding logic ───────────────────────────────────────────────────

/**
 * Scaffold a new Sprout project.
 *
 * Steps:
 *   1. Resolve project name from options
 *   2. Resolve template from options
 *   3. Check if target directory already exists (if exists and non-empty, exit 1)
 *   4. Write all template files to the project directory
 *   5. Print next-steps instructions
 */
export async function initProject(options?: InitOptions): Promise<void> {
  // 1. Resolve project name
  const name = options?.name;

  if (!name) {
    throw new Error("Project name is required. Use --name <name>.");
  }

  const projectDir = resolve(Deno.cwd(), name);

  // 2. Resolve template
  const templateName: TemplateName = options?.template ?? "minimal";
  const template = TEMPLATES[templateName];

  if (!template) {
    const available = Object.keys(TEMPLATES).join(", ");
    throw new Error(
      `Unknown template "${templateName}". Available: ${available}`,
    );
  }

  // 3. Check if target directory already exists
  try {
    const dirInfo = await Deno.stat(projectDir);
    if (dirInfo.isDirectory) {
      // Check if directory is non-empty
      const entries = Array.from(Deno.readDirSync(projectDir));
      if (entries.length > 0) {
        throw new Error(
          `Directory "${name}" already exists and is not empty.`,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      throw err;
    }
    // Directory doesn't exist, which is fine - continue
  }

  // 4. Write all template files
  await ensureDir(projectDir);

  let fileCount = 0;
  for (const file of template.files) {
    const filePath = join(projectDir, file.path);

    // Ensure parent directory exists
    await ensureDir(join(filePath, ".."));

    // Handle .gitkeep files (empty content) and regular files
    if (file.content === "") {
      // Create .gitkeep as empty file
      await Deno.writeFile(filePath, new Uint8Array());
    } else {
      await Deno.writeTextFile(filePath, file.content);
    }
    fileCount++;
  }

  // 5. Print next-steps instructions
  console.log(
    `\n🌱 Project "${name}" created with "${templateName}" template.\n`,
  );
  console.log(`Next steps:`);
  console.log(`  cd ${name}`);
  console.log(`  deno task dev\n`);
}

// ── Backward-compatible renderTemplate stub ─────────────────────────────────

/**
 * Render a template string with variables substituted.
 * @deprecated Use initProject directly instead.
 */
export function renderTemplate(
  template: string,
  _vars: Record<string, string>,
): string {
  return template;
}
