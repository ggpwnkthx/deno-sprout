import type { ErrorPageProps } from "@ggpwnkthx/sprout";

export default function ErrorPage({ error }: ErrorPageProps) {
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
    </div>
  );
}
