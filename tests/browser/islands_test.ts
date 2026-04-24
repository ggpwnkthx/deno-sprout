import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import {
  click,
  getAttribute,
  getInteractiveCounterValue,
  getTextContent,
  islandSelector,
  waitForInteractiveCounterValue,
  waitForIslandHydration,
  withBrowserPage,
} from "@ggpwnkthx/sprout-browser-testing";

const ISLAND = "InteractiveCounter";

Deno.test("browser/islands: InteractiveCounter hydrates", async () => {
  await withBrowserPage({
    name: "browser/islands: InteractiveCounter hydrates",
    pathname: "/",
    assertPage: async (page) => {
      await waitForIslandHydration(page, ISLAND);

      const selector = islandSelector(ISLAND);
      assertEquals(
        await getAttribute(page, selector, "data-island"),
        ISLAND,
        "Expected InteractiveCounter island to keep its SSR data-island marker",
      );

      const dataKey = await getAttribute(page, selector, "data-key");
      assertExists(
        dataKey,
        "Expected InteractiveCounter island to include a data-key attribute",
      );
      assertStringIncludes(
        dataKey,
        ISLAND,
        `Expected data-key to include "${ISLAND}", got ${JSON.stringify(dataKey)
        }`,
      );

      assertEquals(
        await getInteractiveCounterValue(page, ISLAND),
        0,
        "Expected initial counter value to be 0",
      );

      const islandText = await getTextContent(page, selector);
      assertStringIncludes(
        islandText,
        "Count",
        `Expected hydrated island text to include "Count", got ${JSON.stringify(islandText)
        }`,
      );
    },
  });
});

Deno.test("browser/islands: InteractiveCounter increments on click", async () => {
  await withBrowserPage({
    name: "browser/islands: InteractiveCounter increments on click",
    pathname: "/",
    assertPage: async (page) => {
      await waitForIslandHydration(page, ISLAND);

      assertEquals(
        await getInteractiveCounterValue(page, ISLAND),
        0,
        "Expected initial counter value to be 0",
      );

      const buttonSelector = `${islandSelector(ISLAND)} button`;
      await click(page, buttonSelector);
      await waitForInteractiveCounterValue(page, ISLAND, 1);
      assertEquals(
        await getInteractiveCounterValue(page, ISLAND),
        1,
        "Expected counter value to be 1 after one click",
      );

      await click(page, buttonSelector);
      await waitForInteractiveCounterValue(page, ISLAND, 2);
      assertEquals(
        await getInteractiveCounterValue(page, ISLAND),
        2,
        "Expected counter value to be 2 after two clicks",
      );
    },
  });
});
