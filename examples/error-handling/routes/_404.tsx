import type { NotFoundPageProps } from "@ggpwnkthx/sprout";

// Rendered when no route matches the request URL.
export default function NotFound({ url }: NotFoundPageProps) {
  return (
    <main>
      <h1>404 — Page not found</h1>
      <p>
        The path <code>{url.pathname}</code> does not exist.
      </p>
    </main>
  );
}
