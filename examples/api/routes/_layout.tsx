// Minimal API layout — no HTML shell needed since there is no browser page.
// A LayoutComponent must return ComponentChildren, so we return a fragment.
import type { LayoutComponent } from "@ggpwnkthx/sprout";

const ApiLayout: LayoutComponent = ({ children }) => {
  // In a real API project you might add CORS headers or base response headers here
  return <>{children}</>;
};

export default ApiLayout;
