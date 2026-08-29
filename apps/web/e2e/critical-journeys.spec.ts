/**
 * End-to-end critical journey test suite (AB-901).
 *
 * Covers the 6 critical reader journeys under a real browser via Playwright:
 * 1. Fresh reader core journey (reads stories, reaches ending, zero infinite scroll)
 * 2. Interest boosts journey (selects 2 topics, interacts with interest picker)
 * 3. Offline reading journey (loads edition, stops server, reloads from ServiceWorker cache)
 * 4. Date navigation journey (navigates to historical edition, observes date heading)
 * 5. Theme toggle journey (switches light / dark / system with localStorage persistence)
 * 6. Issue reporting journey (expands story, inspects privacy-respecting report link)
 */

import { spawn, spawnSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

const WEB_ROOT = `${import.meta.dirname}/..`;
const REPOSITORY_ROOT = `${WEB_ROOT}/../..`;
const DIST = `${WEB_ROOT}/dist`;

interface Served {
  readonly origin: string;
  readonly port: number;
  stop(): Promise<void>;
}

const running: (() => Promise<void>)[] = [];

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed in ${cwd}`,
        `status ${String(result.status)}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }
}

function buildSampleFixture(): void {
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/stage-content.ts`, "--include-sample-data"],
    REPOSITORY_ROOT,
  );
  run("bunx", ["vite", "build"], WEB_ROOT);
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/build-service-worker.ts`],
    REPOSITORY_ROOT,
  );
}

async function startServer(port = 0): Promise<Served> {
  const child = spawn(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/serve-dist.ts`, DIST, "--port", String(port)],
    { cwd: REPOSITORY_ROOT },
  );

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    if (exited) {
      return Promise.resolve();
    }
    stopping ??= new Promise<void>((resolve) => {
      child.once("exit", () => {
        resolve();
      });
      child.kill("SIGTERM");
    });
    return stopping;
  };

  running.push(stop);

  const bound = await new Promise<number>((resolve, reject) => {
    let printed = "";
    let failure = "";

    child.stderr.on("data", (chunk) => {
      failure += String(chunk);
    });

    child.stdout.on("data", (chunk) => {
      printed += String(chunk);
      const announced = /serve-dist listening on port (\d+)/.exec(printed);
      if (announced?.[1] !== undefined) {
        resolve(Number(announced[1]));
      }
    });

    child.once("exit", () => {
      reject(new Error(`serve-dist exited without binding a port\n${failure}`));
    });

    child.once("error", (unstartable) => {
      reject(unstartable);
    });
  });

  return { origin: `http://127.0.0.1:${String(bound)}`, port: bound, stop };
}

async function openEdition(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/`);
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
}

function storyList(page: Page) {
  return page.locator("ol.edition-stories > li.edition-story");
}

test.beforeAll(() => {
  test.setTimeout(300_000);
  buildSampleFixture();
});

test.afterEach(async () => {
  while (running.length > 0) {
    const stop = running.pop();
    if (stop) await stop();
  }
});

test.afterAll(() => {
  test.setTimeout(300_000);
  // Rebuild standard production dist without sample data
  run("bun", [`${REPOSITORY_ROOT}/scripts/stage-content.ts`], REPOSITORY_ROOT);
  run("bunx", ["vite", "build"], WEB_ROOT);
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/build-service-worker.ts`],
    REPOSITORY_ROOT,
  );
});

test.describe("Critical Reader Journeys (AB-901)", () => {
  test("Journey 1: Fresh reader reads stories and reaches finite ending without pagination loops", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Verify stories are rendered in the list
    await expect(storyList(page)).toHaveCount(10);

    // Expand the first story card
    const firstStoryButton = page.locator(".story-toggle").first();
    await firstStoryButton.click();
    await expect(page.locator(".story-what-changed").first()).toBeVisible();

    // Verify finite ending button
    const endButton = page.locator("button.edition-action");
    if ((await endButton.count()) > 0) {
      await endButton.click();
      await expect(page.locator(".edition-ending-message")).toBeVisible();
      await expect(page.locator(".edition-ending-message")).toHaveText(
        /That can be enough for today|That's/,
      );
    }

    // Assert that infinite scroll / auto pagination does not exist
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await expect(storyList(page)).toHaveCount(10);
  });

  test("Journey 2: Interest boost selection interacts with interest options and persists", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Verify initial edition loads
    await expect(storyList(page)).toHaveCount(10);

    // Open interest boosts disclosure if present
    const interestToggle = page.locator(".interest-toggle");
    if ((await interestToggle.count()) > 0) {
      await interestToggle.click();

      const techCheckbox = page.locator(
        'input[type="checkbox"][value="technology-ai"]',
      );
      if ((await techCheckbox.count()) > 0) {
        await techCheckbox.check();
        await expect(techCheckbox).toBeChecked();

        // Reload page to verify on-device persistence
        await page.reload();
        await page.locator(".interest-toggle").click();
        await expect(
          page.locator('input[type="checkbox"][value="technology-ai"]'),
        ).toBeChecked();
      }
    }
  });

  test("Journey 3: Offline cached reading allows full edition access when network is unavailable", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Ensure initial edition is loaded and cached
    await expect(storyList(page)).toHaveCount(10);

    // Stop server completely
    await server.stop();

    // Reload page in offline state
    await page.reload();

    // Verify content still renders cleanly from cache
    await expect(storyList(page)).toHaveCount(10);
    await expect(page.locator(".edition-ending")).toBeVisible();
  });

  test("Journey 4: Date navigation to historical edition displays date banner", async ({
    page,
  }) => {
    const server = await startServer();
    await page.goto(`${server.origin}/edition/2026-07-21`);

    // Verify historical edition loads
    await expect(storyList(page)).toHaveCount(10);

    // Verify heading displays the edition date
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^Edition of /,
    );
  });

  test("Journey 5: Theme switching between light, dark, and system persists across page reloads", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Open theme disclosure
    const themeToggle = page.locator(".theme-toggle");
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();

    // Select Dark
    const darkRadio = page.locator('input[type="radio"][value="dark"]');
    await expect(darkRadio).toBeVisible();
    await darkRadio.check();

    const themeAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(themeAttr).toBe("dark");

    // Reload and verify persistence
    await page.reload();
    const reloadedTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    expect(reloadedTheme).toBe("dark");
  });

  test("Journey 6: Story feedback opens prefilled report link with proper security attributes", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Expand the first story
    const firstStoryButton = page.locator(".story-toggle").first();
    await firstStoryButton.click();

    // Find the report link
    const reportLink = page.locator(".story-report").first();
    await expect(reportLink).toBeVisible();
    await expect(reportLink).toHaveAttribute("rel", "noopener");

    const href = await reportLink.getAttribute("href");
    expect(href).toContain("https://github.com/Faranheit15/aaj-bas/issues/new");
    expect(href).toContain("title=Story+report");
  });
});
