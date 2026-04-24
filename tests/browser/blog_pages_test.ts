import { assert, assertStringIncludes } from "@std/assert";
import { countElements, getTextContent, withBrowserPage } from "@ggpwnkthx/sprout-browser-testing";

Deno.test("browser/blog: index lists posts", async () => {
  await withBrowserPage({
    name: "browser/blog: index lists posts",
    pathname: "/blog",
    assertPage: async (page) => {
      const heading = await getTextContent(page, "h1");
      assertStringIncludes(
        heading,
        "Blog",
        `Expected blog heading to include "Blog", got ${JSON.stringify(heading)
        }`,
      );

      const linkCount = await countElements(page, "ul li a");
      assert(
        linkCount >= 2,
        `Expected at least 2 blog post links, got ${linkCount}`,
      );

      const firstLinkText = await getTextContent(page, "ul li a");
      assertStringIncludes(
        firstLinkText,
        "Hello World",
        `Expected first blog link to include "Hello World", got ${JSON.stringify(firstLinkText)
        }`,
      );
    },
  });
});

Deno.test("browser/blog: post page renders loader data", async () => {
  await withBrowserPage({
    name: "browser/blog: post page renders loader data",
    pathname: "/blog/hello-world",
    assertPage: async (page) => {
      const heading = await getTextContent(page, "h1");
      assertStringIncludes(
        heading,
        "Post: hello-world",
        `Expected post heading to include "Post: hello-world", got ${JSON.stringify(heading)
        }`,
      );

      const body = await getTextContent(page, "article p");
      assertStringIncludes(
        body,
        "Hello world",
        `Expected article body to include "Hello world", got ${JSON.stringify(body)
        }`,
      );
    },
  });
});
