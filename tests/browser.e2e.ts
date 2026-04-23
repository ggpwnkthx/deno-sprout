/// <reference lib="dom" />
/// <reference lib="deno.ns" />
/**
 * Browser-based end-to-end tests using @astral/astral.
 *
 * Each test owns its own dev server lifecycle so Deno's async-op sanitizer
 * can verify that all server ops start and finish within the same test.
 */
import { launch } from "@astral/astral";
import type { Page } from "@astral/astral";
import { createDevServer } from "@ggpwnkthx/sprout-dev/server";
import { watcherMap } from "@ggpwnkthx/sprout-dev/server";
import { clearClients } from "@ggpwnkthx/sprout-dev/hmr";
import { clearBundlerCache } from "@ggpwnkthx/sprout-dev/lib/bundler";

const FIXTURE_ROOT = "tests/fixtures";
const BROWSER_LAUNCH_TIMEOUT_MS = 30_000;

type DevServerApp = Awaited<ReturnType<typeof createDevServer>>;
type BrowserInstance = Awaited<ReturnType<typeof launch>>;

interface ServerContext {
  readonly app: DevServerApp;
  readonly server: Deno.HttpServer;
  readonly abortController: AbortController;
  readonly baseUrl: string;
}

function getBaseUrl(server: Deno.HttpServer): string {
  const addr = server.addr;

  if (addr.transport !== "tcp") {
    throw new Error(`Expected TCP server, got transport: ${addr.transport}`);
  }

  const hostname = addr.hostname === "0.0.0.0" ? "127.0.0.1" : addr.hostname;
  return `http://${hostname}:${addr.port}`;
}

function disposeApp(app: DevServerApp | null): void {
  clearClients();

  if (app !== null) {
    const watcher = watcherMap.get(app);
    if (watcher) {
      watcher.close();
      watcherMap.delete(app);
    }
  }

  clearBundlerCache();
}

async function startServer(root: string): Promise<ServerContext> {
  const app = await createDevServer({ root });
  const abortController = new AbortController();

  let markListening!: () => void;
  const listening = new Promise<void>((resolve) => {
    markListening = resolve;
  });

  try {
    const server = Deno.serve(
      {
        hostname: "127.0.0.1",
        port: 0,
        signal: abortController.signal,
        onListen() {
          markListening();
        },
      },
      app.fetch,
    );

    await listening;

    return {
      app,
      server,
      abortController,
      baseUrl: getBaseUrl(server),
    };
  } catch (error) {
    disposeApp(app);
    throw error;
  }
}

async function stopServer(context: ServerContext): Promise<void> {
  try {
    context.abortController.abort();
    await context.server.finished;
  } finally {
    disposeApp(context.app);
  }
}

/**
 * Launch a browser, failing fast if the binary is missing or hangs.
 */
async function launchBrowser(options: {
  args?: string[];
}): Promise<BrowserInstance> {
  let timeoutId: number | undefined;

  const launchPromise = launch(options);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Browser launch timed out after 30 seconds")),
      BROWSER_LAUNCH_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([launchPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function textContent(page: Page, selector: string): Promise<string> {
  return await page.evaluate(
    (sel: string) => document.querySelector(sel)?.textContent ?? "",
    { args: [selector] },
  );
}

async function getCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => {
      const el = document.querySelector(
        "[data-island='InteractiveCounter'] .count",
      );
      return el ? Number(el.textContent) : -1;
    },
  );
}

async function elementCount(page: Page, selector: string): Promise<number> {
  return await page.evaluate(
    (sel: string) => document.querySelectorAll(sel).length,
    { args: [selector] },
  );
}

function assertIncludes(
  actual: string,
  expected: string,
  label: string,
): void {
  if (!actual.includes(expected)) {
    throw new Error(
      `Expected ${label} to contain "${expected}", got: ${actual}`,
    );
  }
}

async function withBrowserPage(
  pathname: string,
  assertPage: (page: Page) => Promise<void>,
): Promise<void> {
  const serverContext = await startServer(FIXTURE_ROOT);

  try {
    const browser = await launchBrowser({ args: ["--no-sandbox"] });

    try {
      const page = await browser.newPage(`${serverContext.baseUrl}${pathname}`);

      try {
        await page.waitForNetworkIdle();
        await assertPage(page);
      } finally {
        // browser.close() closes all pages, but closing the page first helps
        // finish page-scoped work before the browser process exits.
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(serverContext);
  }
}

Deno.test("browser: page renders and is interactive", async () => {
  await withBrowserPage("/", async (page) => {
    const h1 = await textContent(page, "h1");
    assertIncludes(h1, "Welcome to Sprout", "h1");

    const count = await elementCount(page, "button");
    if (count === 0) {
      throw new Error(
        "Expected to find at least one <button> element (LikeButton island)",
      );
    }

    const buttonText = await textContent(page, "button");
    assertIncludes(buttonText, "❤️", "button text");
  });
});

Deno.test("browser: blog index lists posts", async () => {
  await withBrowserPage("/blog", async (page) => {
    const h1 = await textContent(page, "h1");
    assertIncludes(h1, "Blog", "h1");

    const linkCount = await elementCount(page, "ul li a");
    if (linkCount < 2) {
      throw new Error(`Expected at least 2 blog post links, got: ${linkCount}`);
    }

    const firstLinkText = await textContent(page, "ul li a");
    assertIncludes(firstLinkText, "Hello World", "first blog link");
  });
});

Deno.test("browser: blog post page renders with data", async () => {
  await withBrowserPage("/blog/hello-world", async (page) => {
    const h1 = await textContent(page, "h1");
    assertIncludes(h1, "Post: hello-world", "h1");

    const body = await textContent(page, "article p");
    assertIncludes(body, "Hello world", "article body");
  });
});

Deno.test(
  "browser: island hydration makes component interactive",
  async () => {
    await withBrowserPage("/", async (page) => {
      // Wait for the island to appear in the DOM after hydration
      let islandFound = false;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200);
        islandFound = await page.evaluate(
          () =>
            document.querySelector('[data-island="InteractiveCounter"]') !==
              null,
        );
        if (islandFound) break;
      }
      if (!islandFound) {
        const html = await page.evaluate(() => document.body.innerHTML);
        console.log(
          "Body innerHTML when island didn't appear:",
          html.slice(0, 500),
        );
        throw new Error("Island did not appear after hydration");
      }

      // Verify island has correct data-island attribute (from SSR)
      const islandAttr = await page.evaluate(
        () =>
          document
            .querySelector("[data-island='InteractiveCounter']")
            ?.getAttribute("data-island"),
      );
      if (!islandAttr) {
        throw new Error(
          "Expected to find InteractiveCounter island with data-island attribute",
        );
      }

      // Verify SSR rendered the initial count
      const initialCount = await getCount(page);
      if (initialCount !== 0) {
        throw new Error(
          `Expected initial count to be 0, got ${initialCount}`,
        );
      }

      // Verify island bundle was loaded by checking the data-key attribute
      // is present (created during SSR by Island component)
      const dataKey = await page.evaluate(
        () =>
          document
            .querySelector("[data-island='InteractiveCounter']")
            ?.getAttribute("data-key"),
      );
      if (!dataKey) {
        throw new Error("Island missing data-key attribute after hydration");
      }
      assertIncludes(
        dataKey,
        "InteractiveCounter",
        "data-key should contain island name",
      );

      // Verify the island div contains rendered content from SSR
      const islandContent = await page.evaluate(
        () =>
          document
            .querySelector("[data-island='InteractiveCounter']")
            ?.textContent ?? "",
      );
      if (!islandContent.includes("Count")) {
        throw new Error("Island SSR content not found in DOM");
      }
    });
  },
);

Deno.test(
  "browser: InteractiveCounter increments on click",
  async () => {
    await withBrowserPage("/", async (page) => {
      // Wait for the island to appear in the DOM after hydration
      let islandFound = false;
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(200);
        islandFound = await page.evaluate(
          () =>
            document.querySelector("[data-island='InteractiveCounter']") !==
              null,
        );
        if (islandFound) break;
      }
      if (!islandFound) {
        const html = await page.evaluate(() => document.body.innerHTML);
        console.log(
          "Body innerHTML when island didn't appear:",
          html.slice(0, 500),
        );
        throw new Error("Island did not appear after hydration");
      }

      // Wait for the button to be actionable (not just present in DOM)
      await page.waitForSelector(
        "[data-island='InteractiveCounter'] button",
      );

      // Read initial count
      const initialCount = await getCount(page);
      if (initialCount !== 0) {
        throw new Error(
          `Expected initial count to be 0, got ${initialCount}`,
        );
      }

      // Click the button
      await page.evaluate(() => {
        const btn = document.querySelector(
          "[data-island='InteractiveCounter'] button",
        ) as HTMLButtonElement | null;
        if (!btn) throw new Error("Button not found");
        btn.click();
      });

      // Give the signal update a moment to propagate
      await page.waitForTimeout(100);

      // Verify count incremented
      const newCount = await getCount(page);
      if (newCount !== 1) {
        throw new Error(
          `Expected count to be 1 after one click, got ${newCount}`,
        );
      }

      // Click again and verify
      await page.evaluate(() => {
        const btn = document.querySelector(
          "[data-island='InteractiveCounter'] button",
        ) as HTMLButtonElement | null;
        if (!btn) throw new Error("Button not found");
        btn.click();
      });
      await page.waitForTimeout(100);

      const finalCount = await getCount(page);
      if (finalCount !== 2) {
        throw new Error(
          `Expected count to be 2 after two clicks, got ${finalCount}`,
        );
      }
    });
  },
);
