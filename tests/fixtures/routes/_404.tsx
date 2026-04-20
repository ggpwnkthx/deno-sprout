import type { NotFoundPageProps } from "@ggpwnkthx/sprout";

export default function NotFound({ url }: NotFoundPageProps) {
  return (
    <div>
      <h1>404 - Page not found</h1>
      <p>{url.pathname} does not exist.</p>
    </div>
  );
}
