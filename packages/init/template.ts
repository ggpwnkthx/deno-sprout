// template.ts - Template rendering and project scaffolding
//
// Provides the template registry, project scaffolding logic, and backward-
// compatible render utility for the @ggpwnkthx/sprout-init package.

import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Built-in template names available for new projects.
 *
 * - `"minimal"` – A minimal Sprout app with a single route and layout.
 * - `"blog"`     – A blog with a post index, slug routes, and an interactive island.
 * - `"api"`      – A REST API with list and item endpoints and full CRUD handlers.
 */
export type TemplateName = "minimal" | "blog" | "api";

/**
 * A file entry to be written into a scaffolded project.
 *
 * @example
 * ```ts
 * { path: "routes/index.tsx", content: "export default () => <p>Hi</p>;" }
 * ```
 */
export interface ProjectFile {
  /** Relative path within the new project, using forward slashes as separator. */
  path: string;
  /** Raw file contents. May be empty (e.g. for `.gitkeep` files). */
  content: string;
}

/**
 * A complete project template, holding metadata and the list of files to write.
 */
export interface Template {
  /** Unique identifier matching a {@link TemplateName}. */
  name: TemplateName;
  /** Human-readable description shown in CLI help and error messages. */
  description: string;
  /** Ordered list of files to write. Each forms one file on disk. */
  files: ProjectFile[];
}

/**
 * Machine-readable error codes produced by the {@link InitError} hierarchy.
 *
 * Allows callers to discriminate error types without string matching on
 * the message or using `instanceof`.
 *
 * @example
 * ```ts
 * import { InitError, initProject } from "@ggpwnkthx/sprout-init";
 * try {
 *   await initProject({ template: "blog" }); // missing name
 * } catch (e) {
 *   if (e instanceof InitError) {
 *     console.error(`[${e.code}] ${e.message}`);
 *   }
 * }
 * ```
 */
export type InitErrorCode =
  | "MISSING_NAME"
  | "UNKNOWN_TEMPLATE"
  | "DIRECTORY_NOT_EMPTY"
  | "INVALID_FILE_PATH";

/**
 * Base class for init errors with a machine-readable code.
 *
 * Subclasses allow callers to distinguish error categories without
 * string-matching on the message.
 */
export class InitError extends Error {
  /** A unique identifier for this error category. */
  readonly code: InitErrorCode;

  constructor(message: string, code: InitErrorCode) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/** Thrown when {@link initProject} is called without a project name. */
export class MissingNameError extends InitError {
  /** The name value supplied by the caller (may be an empty string). */
  readonly nameSupplied: string;

  constructor(name: string) {
    super("Project name is required. Use --name <name>.", "MISSING_NAME");
    this.nameSupplied = name;
  }
}

/** Thrown when the supplied template name is not a known {@link TemplateName}. */
export class UnknownTemplateError extends InitError {
  /** The unknown template name that was supplied. */
  readonly templateName: string;

  constructor(templateName: string, available: TemplateName[]) {
    super(
      `Unknown template "${templateName}". Available: ${available.join(", ")}`,
      "UNKNOWN_TEMPLATE",
    );
    this.templateName = templateName;
  }
}

/** Thrown when the target directory already exists and is non-empty. */
export class DirectoryNotEmptyError extends InitError {
  /** The path to the directory that caused the conflict. */
  readonly path: string;

  constructor(path: string) {
    super(
      `Directory "${path}" already exists and is not empty.`,
      "DIRECTORY_NOT_EMPTY",
    );
    this.path = path;
  }
}

/** Thrown when a template file entry has an invalid (empty or absolute) path. */
export class InvalidFilePathError extends InitError {
  /** The invalid path that was rejected. */
  readonly path: string;

  constructor(path: string) {
    super(
      `Invalid file path in template: "${path}". Paths must be non-empty and relative.`,
      "INVALID_FILE_PATH",
    );
    this.path = path;
    // Validation after assignment: safe to throw InvalidFilePathError now.
    if (!path || path.startsWith("/") || path.includes("..")) {
      throw new InvalidFilePathError(path);
    }
  }
}

/**
 * Options passed to {@link initProject} to control project creation.
 *
 * @example
 * ```ts
 * await initProject({ name: "my-blog", template: "blog" });
 * ```
 */
export interface InitOptions {
  /**
   * Project directory name or relative path.
   *
   * If the path does not exist it is created. If it exists and is non-empty
   * {@link initProject} throws.
   */
  name: string;
  /**
   * Template to use when scaffolding.
   *
   * Defaults to `"minimal"` when not specified.
   */
  template?: TemplateName;
}

// ── SPROUT_IMPORT ─────────────────────────────────────────────────────────────
//
// Resolved once at module load time so template file content (which embeds
// the import specifier as a string) is consistent across the lifetime of the
// module.  This is intentional: template files are static artefacts and the
// SPROUT_LOCAL mechanism is a build-time convenience, not a runtime parameter.

const SPROUT_IMPORT = Deno.env.get("SPROUT_LOCAL") === "1"
  ? "../packages/sprout"
  : "jsr:@ggpwnkthx/sprout@^0.1.0";

/**
 * Returns the import specifier string written into scaffolded `deno.json`
 * files.  Determined once at module load from the `SPROUT_LOCAL` environment
 * variable; callers must not rely on this being stable across module reloads.
 */
function buildDenoJsonContent(sproutImport: string): string {
  return JSON.stringify(
    {
      imports: {
        "@ggpwnkthx/sprout": sproutImport,
      },
      tasks: {
        dev: `deno run -A ${sproutImport}/dev`,
        build: `deno run -A ${sproutImport}/build`,
        check: "deno check routes/**/*.tsx islands/**/*.tsx main.ts",
      },
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "@hono/hono",
      },
    },
    null,
    2,
  );
}

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
    { path: "deno.json", content: buildDenoJsonContent(SPROUT_IMPORT) },
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
    { path: "deno.json", content: buildDenoJsonContent(SPROUT_IMPORT) },
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
    { path: "deno.json", content: buildDenoJsonContent(SPROUT_IMPORT) },
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

/**
 * All built-in templates keyed by {@link TemplateName}.
 *
 * Use this to inspect available templates programmatically.
 *
 * @example
 * ```ts
 * import { TEMPLATES } from "@ggpwnkthx/sprout-init/template";
 * for (const [name, tmpl] of Object.entries(TEMPLATES)) {
 *   console.log(`${name}: ${tmpl.description}`);
 * }
 * ```
 */
export const TEMPLATES: Record<TemplateName, Template> = {
  minimal: MINIMAL_TEMPLATE,
  blog: BLOG_TEMPLATE,
  api: API_TEMPLATE,
};

/** The list of all valid template names, in declaration order. */
const AVAILABLE_TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

/**
 * Validates a template name string and returns it narrowed to {@link TemplateName}.
 *
 * @throws {@link UnknownTemplateError} if the name is not a known template.
 */
export function validateTemplateName(name: string): TemplateName {
  if (name in TEMPLATES) return name as TemplateName;
  throw new UnknownTemplateError(name, AVAILABLE_TEMPLATE_NAMES);
}

// ── Core scaffolding logic ───────────────────────────────────────────────────

/**
 * Scaffolds a new Sprout project on disk.
 *
 * Resolves the project name and template from `options`, checks that the
 * target directory does not already exist or is empty, writes all template
 * files, and prints next-step instructions to stdout.
 *
 * **Errors thrown:**
 * - {@link MissingNameError} when `options.name` is not provided.
 * - {@link UnknownTemplateError} when the template name is not a known {@link TemplateName}.
 * - {@link DirectoryNotEmptyError} when the target directory already exists and is non-empty.
 * - {@link InvalidFilePathError} when a template file entry has an invalid path.
 *
 * @param options - {@link InitOptions} controlling project name and template.
 *   `name` is required; `template` defaults to `"minimal"`.
 *
 * @example
 * ```ts
 * import { initProject } from "@ggpwnkthx/sprout-init";
 *
 * // Minimal project in ./my-app
 * await initProject({ name: "my-app" });
 *
 * // Blog template
 * await initProject({ name: "my-blog", template: "blog" });
 * ```
 */
export async function initProject(options: InitOptions): Promise<void> {
  // 1. Resolve project name
  const { name } = options;

  if (!name) {
    throw new MissingNameError(name);
  }

  const projectDir = resolve(Deno.cwd(), name);

  // 2. Resolve template
  const templateName: TemplateName = options.template ?? "minimal";
  const template = TEMPLATES[templateName];
  // Defensive fallback: validateTemplateName (called by main()) should have
  // already validated, but direct callers of initProject may skip that check.
  if (!template) {
    throw new UnknownTemplateError(templateName, AVAILABLE_TEMPLATE_NAMES);
  }

  // 3. Check if target directory already exists
  try {
    const dirInfo = await Deno.stat(projectDir);
    if (dirInfo.isDirectory) {
      // Check if directory is non-empty
      const entries = Array.from(Deno.readDirSync(projectDir));
      if (entries.length > 0) {
        throw new DirectoryNotEmptyError(name);
      }
    }
    // Path exists but is not a directory — Deno.stat succeeded above but
    // something changed between the stat and now; treat as non-existent and continue.
  } catch (err) {
    if (err instanceof InitError) throw err;
    // NotFound means the path does not exist yet — safe to ignore and continue.
    if (err instanceof Deno.errors.NotFound) {
      // continue
    } else {
      throw err;
    }
  }

  // 4. Write all template files
  await ensureDir(projectDir);

  for (const file of template.files) {
    // Construction validates; throws InvalidFilePathError if path is invalid
    new InvalidFilePathError(file.path);
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
 * Returns the input template string unchanged.
 *
 * @param template - The template string (placeholder substitution is not performed).
 * @param _vars   - Ignored. Accepted for API compatibility only.
 * @returns The input `template` with no modifications.
 *
 * @deprecated This function is a no-op stub kept for backward compatibility.
 *   For new code, use {@link initProject} directly; template files are
 *   fully static and require no runtime substitution.
 */
export function renderTemplate(
  template: string,
  _vars: Record<string, string>,
): string {
  return template;
}
