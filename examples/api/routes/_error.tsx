// Custom error page for API routes
import type { ErrorPageProps } from "@ggpwnkthx/sprout";

export default function ErrorPage({ error }: ErrorPageProps) {
  return <pre>API Error: {error.message}</pre>;
}
