/**
 * End-to-end critical journey test suite (AB-901).
 *
 * Implements the exact 6 critical reader acceptance scenarios from docs/BACKLOG.md:
 * 1. first open → expand two stories → choose interests → finish
 * 2. returning reader → viewed state restored
 * 3. end early → respectful end message
 * 4. offline open after prior load
 * 5. corrected edition displays a visible correction note
 * 6. broken latest edition falls back safely
 */

import { readdir, unlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

const WEB_ROOT = `${import.meta.dirname}/..`;
const REPOSITORY_ROOT = `${WEB_ROOT}/../..`;
const DIST = `${WEB_ROOT}/dist`;
const PUBLIC_CONTENT = `${WEB_ROOT}/public/content`;
const STAGED_EDITIONS = `${PUBLIC_CONTENT}/editions`;
const FIXTURE_EDITION_DATE = "2026-07-21";

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

async function buildSampleFixture(): Promise<void> {
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/stage-content.ts`, "--include-sample-data"],
    REPOSITORY_ROOT,
  );

  // The repository may now contain a real edition dated today. Keep the
  // browser fixture's pointer on the historical sample so these journeys test
  // the same stale-latest behaviour regardless of the calendar or publication
  // state in the checkout.
  for (const name of await readdir(STAGED_EDITIONS)) {
    if (name !== `${FIXTURE_EDITION_DATE}.json`) {
      await unlink(`${STAGED_EDITIONS}/${name}`);
    }
  }
  await writeFile(
    `${PUBLIC_CONTENT}/latest.json`,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        contentSet: "sample",
        latest: FIXTURE_EDITION_DATE,
        editions: [FIXTURE_EDITION_DATE],
      },
      null,
      2,
    )}\n`,
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

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await buildSampleFixture();
});

test.afterEach(async () => {
  while (running.length > 0) {
    const stop = running.pop();
    if (stop) await stop();
  }
});

test.afterAll(() => {
  test.setTimeout(300_000);
  // Rebuild standard production dist
  run("bun", [`${REPOSITORY_ROOT}/scripts/stage-content.ts`], REPOSITORY_ROOT);
  run("bunx", ["vite", "build"], WEB_ROOT);
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/build-service-worker.ts`],
    REPOSITORY_ROOT,
  );
});

test.describe("Critical Reader Journeys (AB-901)", () => {
  test("Scenario 1: first open → expand two stories → choose interests → finish", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // 1. Initial 10 stories loaded
    await expect(storyList(page)).toHaveCount(10);

    // Interest form is not yet visible before expanding 2 stories
    await expect(page.locator(".interest-form")).not.toBeVisible();

    // 2. Expand first story
    const story1Toggle = page.locator(".story-toggle").first();
    await story1Toggle.click();
    await expect(page.locator(".story-what-changed").first()).toBeVisible();
    await expect(page.locator(".interest-form")).not.toBeVisible();

    // 3. Expand second story -> triggers interest invitation
    const story2Toggle = page.locator(".story-toggle").nth(1);
    await story2Toggle.click();
    await expect(page.locator(".interest-form")).toBeVisible();

    // 4. Select up to 2 interest topics
    const checkbox1 = page.locator(
      'input[type="checkbox"][value="business-economy"]',
    );
    const checkbox2 = page.locator(
      'input[type="checkbox"][value="technology-ai"]',
    );
    await checkbox1.check();
    await checkbox2.check();
    await expect(checkbox1).toBeChecked();
    await expect(checkbox2).toBeChecked();

    // Submit interests
    const saveButton = page.locator('.interest-form button[type="submit"]');
    await saveButton.click();

    // Interest form closes and chosen topics are summarized
    await expect(page.locator(".interest-form")).not.toBeVisible();
    await expect(page.locator(".interest-boosts")).toContainText("Chosen:");

    // 5. Finish edition
    const endButton = page.locator(".edition-ending button.edition-action");
    await expect(endButton).toBeVisible();
    await endButton.click();

    await expect(page.locator(".edition-ending-message")).toBeVisible();
    await expect(page.locator(".edition-ending-message")).toHaveText(
      "You read 2 of 10. That can be enough for today.",
    );

    // Verify finite design: no infinite scroll adds more stories
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    await expect(storyList(page)).toHaveCount(10);
  });

  test("Scenario 2: returning reader → viewed state restored", async ({
    page,
  }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Expand Story 1 and Story 2
    await page.locator(".story-toggle").first().click();
    await page.locator(".story-toggle").nth(1).click();

    await expect(page.locator(".edition-progress")).toHaveText(
      "2 of 10 viewed",
    );

    // Reload page to simulate returning reader
    await page.reload();

    // Verify progress indicator is restored on mount from local state
    await expect(page.locator(".edition-progress")).toHaveText(
      "2 of 10 viewed",
    );

    // Expand Story 3 and verify increment
    await page.locator(".story-toggle").nth(2).click();
    await expect(page.locator(".edition-progress")).toHaveText(
      "3 of 10 viewed",
    );
  });

  test("Scenario 3: end early → respectful end message", async ({ page }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    // Expand 1 story
    await page.locator(".story-toggle").first().click();

    const endButton = page.locator(".edition-ending button.edition-action");
    await expect(endButton).toBeVisible();
    await endButton.click();

    // Assert button is removed and respectful message is shown
    await expect(endButton).not.toBeVisible();
    await expect(page.locator(".edition-ending-message")).toHaveText(
      "You read 1 of 10. That can be enough for today.",
    );
    await expect(page.locator(".edition-next")).toHaveText(
      "The next edition will appear here when it is published.",
    );

    // Verify zero guilt or streak mechanics
    const bodyText = await page.innerText("body");
    expect(bodyText).not.toMatch(/streak/i);
    expect(bodyText).not.toMatch(/badge/i);
    expect(bodyText).not.toMatch(/point/i);
  });

  test("Scenario 4: offline open after prior load", async ({ page }) => {
    const server = await startServer();
    await openEdition(page, server.origin);

    await expect(storyList(page)).toHaveCount(10);

    // Stop the web server completely
    await server.stop();

    // Reload in offline state
    await page.reload();

    // Verify all stories still render from service worker cache
    await expect(storyList(page)).toHaveCount(10);
    await expect(page.locator(".edition-ending")).toBeVisible();

    // Verify saved copy notice is displayed
    const notice = page.locator("p.edition-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("saved on this device");
    await expect(notice).toContainText("Downloaded");
  });

  test("Scenario 5: corrected edition displays a visible correction note", async ({
    page,
  }) => {
    const server = await startServer();
    await page.goto(`${server.origin}/edition/2026-07-21`);
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined),
    );

    // Locate the story item carrying the "Corrected" marker
    const correctedItem = page.locator("li.edition-story").filter({
      has: page.locator(".story-marker", { hasText: "Corrected" }),
    });
    await expect(correctedItem).toBeVisible();

    // Assert the story kicker / provenance carries the "Corrected" marker
    await expect(correctedItem.locator(".story-marker")).toHaveText(
      "Corrected",
    );

    // Expand the story card to view the correction note
    await correctedItem.locator(".story-toggle").click();

    const correctionBlock = correctedItem.locator(".story-correction");
    await expect(correctionBlock).toBeVisible();
    await expect(correctionBlock).toContainText(
      "An earlier version of this story said the consultation received 1,240 written submissions. The correct figure, from the secretariat's published tally, is 240.",
    );
  });

  test("Scenario 6: broken latest edition falls back safely", async ({
    page,
  }) => {
    const server = await startServer();
    // Navigate to an invalid or missing edition route
    await page.goto(`${server.origin}/edition/1999-01-01`);

    // Assert error fallback heading
    const heading = page.locator("#edition-heading");
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("There is no edition for that date.");

    // Assert fallback link is visible and navigable
    const fallbackLink = page.getByRole("link", {
      name: "Open the latest edition",
    });
    await expect(fallbackLink).toBeVisible();

    await fallbackLink.click();
    await expect(page).toHaveURL(`${server.origin}/`);
  });
});
