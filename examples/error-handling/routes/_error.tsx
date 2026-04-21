import type { ErrorPageProps } from "@ggpwnkthx/sprout";

// Rendered when a route throws an error.
export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
    </main>
  );
}
