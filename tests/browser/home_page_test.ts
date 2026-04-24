import { assert, assertStringIncludes } from "@std/assert";
import { countElements, getTextContent, withBrowserPage } from "@ggpwnkthx/sprout-browser-testing";

Deno.test("browser/home: renders the landing page", async () => {
  await withBrowserPage({
    name: "browser/home: renders the landing page",
    pathname: "/",
    assertPage: async (page) => {
      const heading = await getTextContent(page, "h1");
      assertStringIncludes(
        heading,
        "Welcome to Sprout",
        `Expected h1 to include "Welcome to Sprout", got ${JSON.stringify(heading)
        }`,
      );

      const buttonCount = await countElements(page, "button");
      assert(
        buttonCount >= 1,
        `Expected at least one <button>, got ${buttonCount}`,
      );

      const buttonText = await getTextContent(page, "button");
      assertStringIncludes(
        buttonText,
        "❤️",
        `Expected first button to include "❤️", got ${JSON.stringify(buttonText)
        }`,
      );
    },
  });
});
