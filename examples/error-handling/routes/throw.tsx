// This route deliberately throws to trigger routes/_error.tsx
import type { PageComponent } from "@ggpwnkthx/sprout";

const ThrowPage: PageComponent = () => {
  throw new Error("This page intentionally threw an error.");
};

export default ThrowPage;
