import type { PageComponent } from "@ggpwnkthx/sprout";

const ThrowPage: PageComponent = () => {
  throw new Error("test error");
};

export default ThrowPage;
