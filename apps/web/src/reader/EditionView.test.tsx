import "@testing-library/jest-dom/vitest";
import type { Edition, SourceReference, Story } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import editionJson from "../../../../content/editions/2026-07-21.json";
import type { EditionFreshness } from "../edition/edition-freshness";
import type { EditionSource } from "../edition/edition-repository";
import {
  formatEditionDate,
  formatEditionInstant,
} from "../edition/editorial-day";
import { localStateV1Schema } from "../local-state/local-state";
import {
  LOCAL_STATE_KEY,
  rememberInterests,
  rememberViewed,
} from "../local-state/local-state-store";
import { EditionView } from "./EditionView";
import type { EditionEndedStore } from "./edition-ended";
import { useEditionEnded } from "./edition-ended";
import type { ViewedStoriesStore } from "./viewed-stories";
import { useViewedStories } from "./viewed-stories";

/*
  The real hook, wrapped in a spy so the test can read the state it holds.

  Acceptance criterion 3 — expanding a card records it as viewed — has nothing
  observable in the DOM to assert against, and deliberately so: section 3.5
  rules out a per-card viewed marker, because "viewed" on one card implies
  "unviewed" on the rest and turns a finite edition into a checklist to clear.
  So the state has to be read where it lives.

  Of the ways to reach it, this is the one that costs the component nothing. An
  injected-store prop or an exported test seam would put API on `EditionView`
  that no caller in the product uses, which sections 13 and 48 both refuse, and
  a probe component calling `useViewedStories` itself would hold a *second*,
  unrelated instance of the state and prove nothing about the first.

  `importOriginal` keeps the real implementation running underneath, so this is
  not the mocked-implementation-under-test section 29 warns about: every
  assertion below is against state the actual hook computed. What the spy adds
  is a handle on the value `EditionView` received.
*/
vi.mock("./viewed-stories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./viewed-stories")>();
  return { ...actual, useViewedStories: vi.fn(actual.useViewedStories) };
});

/*
  The same wrapping, for the same reason, on the ended store. The ending is
  visible in the DOM, so most of it can be asserted there — but "the ended state
  is already right on the FIRST render" cannot be: `render` is wrapped in `act`,
  so an implementation that loaded the flag in an effect has already corrected
  itself before any DOM query runs. Reading the value the hook returned to
  `EditionView` on its first render is the version of that claim that can fail.
*/
vi.mock("./edition-ended", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./edition-ended")>();
  return { ...actual, useEditionEnded: vi.fn(actual.useEditionEnded) };
});

afterEach(() => {
  cleanup();
  vi.mocked(useViewedStories).mockClear();
  vi.mocked(useEditionEnded).mockClear();
  // jsdom keeps one storage area for the whole file, so a document written by
  // one test would otherwise be on the device when the next one renders.
  localStorage.clear();
});

/**
 * The real published edition, parsed rather than cast.
 *
 * `resolveJsonModule` types the import from the file's own contents, and
 * letting that type stand would have TypeScript assert the shape these tests
 * exist to render. Parsing widens it back to the contract, and fails loudly
 * here rather than halfway through a render.
 */
const edition: Edition = editionSchema.parse(editionJson as unknown);

/** Narrows away the absence `noUncheckedIndexedAccess` adds, loudly. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to be present`);
  }
  return value;
}

type RenderOptions = {
  readonly edition?: Edition;
  readonly freshness?: EditionFreshness;
  readonly source?: EditionSource;
  readonly copyDate?: string | null;
};

/**
 * Every render in this file, with the dimensions a given test is not about
 * left at the ordinary case: today's edition, fetched over the network.
 *
 * The component takes four props from AB-206 onwards, and spelling all four at
 * every call site would reflow each of them into seven lines of JSX saying
 * nothing — the tests about interest pools, ordinals and focus order are not
 * arguments about where the bytes came from. Naming only the dimension under
 * test also makes the cache renders below legible as the exceptions they are.
 *
 * Read with `??` rather than spread, so `exactOptionalPropertyTypes` cannot be
 * satisfied by handing the component `undefined` for a prop it requires.
 */
function renderEdition(options: RenderOptions = {}) {
  return render(
    <EditionView
      edition={options.edition ?? edition}
      freshness={options.freshness ?? "current"}
      source={options.source ?? "network"}
      copyDate={options.copyDate ?? null}
    />,
  );
}

/** An instant a copy was downloaded, never the fixture's publication time. */
const DOWNLOADED = "2026-07-21T07:12:00+05:30";

/** The core eight, resolved from the edition's own ids rather than from the
 * helper the component uses, so the test can disagree with it. */
const coreStories: Story[] = edition.coreStoryIds.map((id) =>
  present(
    edition.stories.find((candidate) => candidate.id === id),
    `core story ${id}`,
  ),
);

const coreHeadlines = coreStories.map((story) => story.headline);

function coreStoryAt(index: number): Story {
  return present(coreStories[index], `core story ${index}`);
}

/** Resolved in `sourceIds` order, which is the order the card cites them. */
function sourcesOf(story: Story): SourceReference[] {
  return story.sourceIds.map((id) =>
    present(
      edition.sources.find((candidate) => candidate.id === id),
      `source ${id}`,
    ),
  );
}

/** The edition's own publication line, as distinct from any story's. */
function editionFreshnessLine(container: HTMLElement): HTMLElement {
  return present(
    container.querySelector<HTMLElement>(".edition-freshness"),
    "the edition freshness line",
  );
}

/** The one control a collapsed card has. */
function toggleIn(card: HTMLElement): HTMLElement {
  return within(card).getByRole("button");
}

/**
 * The store as of the component's most recent render.
 *
 * The last result, not the first: `viewed` is a fresh value on every render, so
 * the store captured before a click still carries the set as it was then.
 */
function viewedNow(): ViewedStoriesStore {
  const { results } = vi.mocked(useViewedStories).mock;
  const last = present(results[results.length - 1], "a render of the store");
  if (last.type !== "return") {
    throw new Error("the viewed store threw instead of returning");
  }
  return last.value;
}

/** Viewed story ids, as the store holds them. */
function viewedIds(): string[] {
  return [...viewedNow().viewed.storyIds];
}

/**
 * Viewed story ids as of the component's FIRST render.
 *
 * `render` is wrapped in `act`, so every assertion made after it has already
 * had the effects flushed: `viewedIds()` cannot distinguish a store that was
 * correct immediately from one that flashed empty and then settled. Reading
 * `results[0]` is reading the value `EditionView` actually rendered with.
 */
function viewedIdsOnFirstRender(): string[] {
  const { results } = vi.mocked(useViewedStories).mock;
  const first = present(results[0], "the store's first render");
  if (first.type !== "return") {
    throw new Error("the viewed store threw instead of returning");
  }
  return [...first.value.viewed.storyIds];
}

/** The ended store as of the component's most recent render. */
function endedNow(): EditionEndedStore {
  const { results } = vi.mocked(useEditionEnded).mock;
  const last = present(results[results.length - 1], "a render of the store");
  if (last.type !== "return") {
    throw new Error("the ended store threw instead of returning");
  }
  return last.value;
}

/** Whether the edition was already ended on the component's FIRST render. */
function endedOnFirstRender(): boolean {
  const { results } = vi.mocked(useEditionEnded).mock;
  const first = present(results[0], "the store's first render");
  if (first.type !== "return") {
    throw new Error("the ended store threw instead of returning");
  }
  return first.value.hasEnded;
}

/** The one line that says how much of the edition has been opened. */
function progressLine(container: HTMLElement): HTMLElement {
  return present(
    container.querySelector<HTMLElement>(".edition-progress"),
    "the progress line",
  );
}

/**
 * How many cards the page actually rendered. Never a literal.
 *
 * Scoped to the story list rather than to every `listitem` on the page: the
 * interest picker renders its six options as a list too, so an unscoped count
 * would silently add them to the edition's size and print "0 of 16" the moment
 * the invitation appeared.
 */
function cardCount(): number {
  return storyCards().length;
}

/**
 * The story cards, and nothing else that happens to be a list item.
 *
 * Two things on this page render list items that are not cards, and both would
 * silently inflate a bare `getAllByRole("listitem")`: the interest picker's six
 * options, and the source list an expanded card unfolds inside itself. Matching
 * the card element directly is immune to both, so a count taken after the
 * reader has opened something still means what it says.
 */
function storyCards(): HTMLElement[] {
  const list = present(
    document.querySelector<HTMLElement>(".edition-stories"),
    "the story list",
  );
  return [...list.querySelectorAll<HTMLElement>(":scope > .edition-story")];
}

/** The first pooled story, which the published edition is small enough to show. */
const poolStory: Story = present(
  edition.stories.find((story) => !edition.coreStoryIds.includes(story.id)),
  "an interest-pool story",
);

/**
 * The same edition with a deeper pool than a reader can be shown.
 *
 * The published sample carries exactly two pooled stories, so every reader sees
 * all of them and "a story this render does not show" does not exist in it.
 * That is a property of one file, not of the product: an edition may offer any
 * number of candidates, and the tests that matter most here — the denominator
 * counts the page rather than the file, and the counter ignores a stored id
 * that is not on screen — are exactly the ones that need a pool bigger than the
 * two slots it fills.
 *
 * Built by cloning a real pooled story rather than inventing one, so the topic
 * still matches its pool and the sources still resolve, and parsed through
 * `editionSchema` so a fixture that drifted out of contract fails here.
 */
const wideEdition: Edition = editionSchema.parse({
  ...edition,
  stories: [
    ...edition.stories,
    { ...poolStory, id: `${poolStory.id}-second` },
    { ...poolStory, id: `${poolStory.id}-third` },
  ],
  interestPools: {
    ...edition.interestPools,
    [poolStory.topic]: [
      ...(edition.interestPools[
        poolStory.topic as keyof typeof edition.interestPools
      ] ?? []),
      `${poolStory.id}-second`,
      `${poolStory.id}-third`,
    ],
  },
} as unknown);

/**
 * An edition whose two pools can each supply both slots.
 *
 * `wideEdition` deepens one pool, which is enough to prove that the page shows
 * fewer stories than the file holds. It cannot show that a CHOICE changes the
 * selection, because with one deep pool the same two stories win either way.
 * This fixture gives both pools two candidates, so a reader who boosts one
 * topic receives both of that topic's stories and a reader who boosts nothing
 * receives one from each — a difference the reader can see.
 */
const twoPoolEdition: Edition = editionSchema.parse({
  ...edition,
  stories: [
    ...edition.stories,
    ...edition.stories
      .filter((story) => !edition.coreStoryIds.includes(story.id))
      .map((story) => ({ ...story, id: `${story.id}-extra` })),
  ],
  interestPools: Object.fromEntries(
    Object.entries(edition.interestPools).map(([interest, ids]) => [
      interest,
      [...(ids ?? []), ...(ids ?? []).map((id) => `${id}-extra`)],
    ]),
  ),
} as unknown);

/** The headlines the page is showing, in order, cards only. */
function renderedHeadlines(): string[] {
  return storyCards().map(
    (card) => within(card).getByRole("heading", { level: 2 }).textContent ?? "",
  );
}

/**
 * A pooled story that a render of `wideEdition` leaves out.
 *
 * Resolved by rendering nothing and reasoning from the contract: only two
 * pooled stories reach the page, so with four candidates at least one is
 * always absent. Used to seed the device with a viewed id the reader cannot
 * see, which is the real shape of the bug it guards rather than an invented
 * identifier.
 */
const unseenPoolStory: Story = present(
  wideEdition.stories.find((story) => story.id === `${poolStory.id}-third`),
  "a pooled story left off the page",
);

/** The block at the end of the edition, in whichever state it is in. */
function endingBlock(container: HTMLElement): HTMLElement {
  return present(
    container.querySelector<HTMLElement>(".edition-ending"),
    "the ending block",
  );
}

/** The end-edition control, or null once the edition is over. */
function endControl(): HTMLElement | null {
  return screen.queryByRole("button", { name: /^End (today's|this) edition$/ });
}

function pressEnd(): void {
  fireEvent.click(present(endControl(), "the end-edition control"));
}

/** What the device holds for one edition, read back through the real schema. */
function storedIdsFor(editionDate: string): readonly string[] {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (raw === null) {
    return [];
  }

  const document = localStateV1Schema.parse(JSON.parse(raw));

  return document.viewedByEdition[editionDate] ?? [];
}

describe("a rendered edition", () => {
  it("carries exactly one first-level heading, naming the edition's date", () => {
    renderEdition();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      `Edition of ${formatEditionDate(edition.date)}`,
    );
  });

  it("machine-reads the edition date from the contract value", () => {
    const { container } = renderEdition();

    expect(container.querySelector("h1 time")).toHaveAttribute(
      "datetime",
      "2026-07-21",
    );
  });

  it("renders ten stories: the shared eight, then two from the pools", () => {
    /*
      The whole edition, and the same size for every reader. Interests decide
      WHICH two pooled stories arrive, never how many — a reader who has chosen
      nothing still gets ten. Eight-until-you-choose would make the invitation
      below the list a prompt whose payoff is more content (section 3.2).

      Rendered against `wideEdition`, whose pool holds four candidates, so this
      also fails if the component maps `edition.stories` and hands the reader
      the entire pool.
    */
    renderEdition({ edition: wideEdition });

    const cards = storyCards();
    expect(cards).toHaveLength(10);
    expect(wideEdition.stories.length).toBeGreaterThan(10);
  });

  it("puts the shared core first, in the order the edition ranked it", () => {
    /*
      `coreStoryIds` order IS the editorial ranking. Appending the pooled
      stories keeps positions one to eight naming the same stories for every
      reader; interleaving would make the ranking of shared stories depend on a
      preference, which nothing in the product authorises (section 22).
    */
    renderEdition({ edition: wideEdition });

    const headlines = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headlines.slice(0, 8)).toEqual(coreHeadlines);
  });

  it("gives every story a second-level heading", () => {
    // Still an `h2`, and still exactly the headline: the card puts the
    // disclosure button *inside* the heading, which leaves its text unchanged.
    renderEdition();

    const headlines = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headlines).toHaveLength(cardCount());
    expect(headlines.slice(0, 8)).toEqual(coreHeadlines);
  });

  it("numbers each card against the cards actually on the page", () => {
    /*
      The denominator is read back out of the DOM rather than compared against
      a constant, which is the whole point of the assertion: "1 of 10" above a
      list that ends at eight would be the product telling the reader there is
      more edition somewhere, and a test carrying its own hardcoded ten could
      not tell the difference. Counting the rendered list items means this
      fails the moment the two numbers disagree, whatever they are.
    */
    renderEdition({ edition: wideEdition });

    const cards = storyCards();
    const total = cards.length;
    // Rendered from `wideEdition`, whose pool is deeper than the two slots it
    // fills, so the file genuinely holds more stories than the page shows.
    expect(total).toBeLessThan(wideEdition.stories.length);

    cards.forEach((card, index) => {
      expect(
        within(card).getByText(`${index + 1} of ${total}`),
      ).toBeInTheDocument();
    });
  });

  it("shows the publication instant with its contract timestamp", () => {
    const { container } = renderEdition();

    const published = container.querySelector(".edition-freshness time");
    expect(published).toHaveAttribute("datetime", "2026-07-21T06:00:00+05:30");
    expect(published).toHaveTextContent(
      formatEditionInstant(edition.publishedAt),
    );
  });

  it("shows an update time only when the edition was updated after publication", () => {
    /*
      Scoped to the freshness line, not to the page. A story card carries its
      own "Updated" marker, and the two are different statements: one says this
      edition changed after it was published, the other says this story did.
      An unscoped `/Updated/` would let either satisfy the other's test.
    */
    const { container } = renderEdition();

    const freshness = editionFreshnessLine(container);
    expect(within(freshness).getByText(/Updated/)).toBeInTheDocument();
    const updated = within(freshness)
      .getByText(formatEditionInstant(edition.updatedAt))
      .closest("time");
    expect(updated).toHaveAttribute("datetime", "2026-07-21T19:20:00+05:30");
  });

  it("shows no update time when the edition has not been updated", () => {
    const { container } = renderEdition({
      edition: { ...edition, updatedAt: edition.publishedAt },
    });

    expect(editionFreshnessLine(container)).not.toHaveTextContent(/Updated/);
  });

  it("says nothing about freshness when the edition is today's", () => {
    const { container } = renderEdition();

    expect(container.querySelector(".edition-notice")).toBeNull();
  });

  it("says today's edition is not published yet when it is not", () => {
    renderEdition({ freshness: "stale" });

    expect(
      screen.getByText(
        "Today's edition is not published yet. This is the most recent edition.",
      ),
    ).toBeInTheDocument();
    // The wording is a paragraph, never a heading: the heading names the date
    // this edition actually is.
    expect(screen.queryByRole("heading", { name: /Today's/ })).toBeNull();
  });

  it("says an edition read by date is a past edition", () => {
    renderEdition({ freshness: "archived" });

    expect(screen.getByText("This is a past edition.")).toBeInTheDocument();
  });

  it("says a saved copy of today's edition is today's edition", () => {
    renderEdition({ source: "cache", copyDate: DOWNLOADED });

    expect(
      screen.getByText(/This is today's edition, saved on this device\./),
    ).toBeInTheDocument();
  });

  it("carries exactly one notice, whichever combination it is handed", () => {
    /*
      Two dimensions meet in this paragraph now, and the failure they invite is
      two notices stacked on one page — the freshness sentence and a separate
      cache banner, saying overlapping things in different words. Every
      combination is rendered, and each is allowed exactly the one paragraph
      the table says it has.

      Written as a literal table rather than by calling `editionNotice` for the
      expectation, which would pass no matter what either side did as long as
      they agreed.
    */
    const expected: readonly {
      readonly freshness: EditionFreshness;
      readonly source: EditionSource;
      readonly notices: number;
    }[] = [
      { freshness: "current", source: "network", notices: 0 },
      { freshness: "stale", source: "network", notices: 1 },
      { freshness: "archived", source: "network", notices: 1 },
      { freshness: "current", source: "cache", notices: 1 },
      { freshness: "stale", source: "cache", notices: 1 },
      { freshness: "archived", source: "cache", notices: 1 },
    ];

    for (const { freshness, source, notices } of expected) {
      const { container } = renderEdition({
        freshness,
        source,
        copyDate: DOWNLOADED,
      });

      expect([
        freshness,
        source,
        container.querySelectorAll(".edition-notice").length,
      ]).toEqual([freshness, source, notices]);
      cleanup();
    }
  });

  it("keeps the download time and the publication time apart", () => {
    /*
      THE MOST MISLEADING BUG AVAILABLE HERE is conflating these two instants.
      One is when the PUBLISHER issued this edition; the other is when THIS
      DEVICE received the copy being read. A reader checking whether they are
      looking at current news reads the first, and a single `<time>` carrying
      whichever value was assembled last would answer that question wrongly
      while looking entirely correct.

      Asserted as two elements with two different machine values, so neither
      the visible text nor the `datetime` can be shared between them.
    */
    const { container } = renderEdition({
      source: "cache",
      copyDate: DOWNLOADED,
    });

    const notice = present(
      container.querySelector<HTMLElement>(".edition-notice"),
      "the edition notice",
    );
    const downloaded = present(
      notice.querySelector("time"),
      "the download instant",
    );
    const published = present(
      editionFreshnessLine(container).querySelector("time"),
      "the publication instant",
    );

    // The whole paragraph, so the download clause is asserted to sit after the
    // notice's own sentence rather than merely to exist somewhere on the page.
    expect(notice.textContent).toBe(
      `This is today's edition, saved on this device. Downloaded ${formatEditionInstant(DOWNLOADED)}.`,
    );
    expect(downloaded).toHaveAttribute("datetime", DOWNLOADED);
    expect(downloaded).toHaveTextContent(formatEditionInstant(DOWNLOADED));
    expect(published).toHaveAttribute("datetime", edition.publishedAt);
    expect(downloaded.getAttribute("datetime")).not.toBe(
      published.getAttribute("datetime"),
    );
  });

  it("drops the download sentence when the instant is not known", () => {
    // Never "Downloaded Invalid Date", and never the current time standing in
    // for one: the notice keeps its text and says less. `edition-notice.test`
    // argues why at the layer that decides it.
    const { container } = renderEdition({ source: "cache", copyDate: null });

    const notice = present(
      container.querySelector<HTMLElement>(".edition-notice"),
      "the edition notice",
    );

    expect(notice).toHaveTextContent("saved on this device");
    expect(notice.querySelector("time")).toBeNull();
    expect(notice).not.toHaveTextContent(/Downloaded|Invalid Date/);
  });

  it("offers nothing to press on a saved copy that it does not offer otherwise", () => {
    /*
      No refresh, no "try again", no "check for a newer edition". PRD section 8
      excludes user-triggered fetching from v1, and a control offered only to a
      reader on a saved copy is offered exactly to the reader least able to use
      it.

      Compared against the network render rather than asserted as an absolute
      count: the claim is that the cache adds nothing, and a count would drift
      with every control the edition legitimately grows.
      `EditionUnavailable` keeps "Try again", where there is no edition on the
      screen to lose.
    */
    const names = (): string[] =>
      [
        ...screen.queryAllByRole("button"),
        ...screen.queryAllByRole("link"),
      ].map((control) => control.textContent ?? "");

    renderEdition();
    const online = names();
    cleanup();

    renderEdition({ source: "cache", copyDate: DOWNLOADED });

    expect(names()).toEqual(online);
    expect(
      screen.queryByRole("button", { name: /refresh|try again|update/i }),
    ).toBeNull();
  });

  it("offers no link out of the edition while every card is collapsed", () => {
    /*
      The edition as it is first read is a closed list of headlines with
      nothing to click away to. Source links do exist now, but only inside a
      card the reader deliberately opened, so the default state still offers
      no exit — and nothing here, in either state, continues the edition.
    */
    renderEdition();

    for (const card of storyCards()) {
      expect(toggleIn(card)).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("expanding a story", () => {
  it("reveals that story's sources and leaves the other cards shut", () => {
    renderEdition();

    const cards = storyCards();
    const first = present(cards[0], "the first card");
    fireEvent.click(toggleIn(first));

    const cited = sourcesOf(coreStoryAt(0));
    const hrefs = within(first)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    for (const source of cited) {
      expect(hrefs).toContain(source.url);
    }
    // Its sources, and the report link. Nothing else.
    expect(hrefs).toHaveLength(cited.length + 1);
    // No other card contributed a link, so the page's links are this card's.
    expect(screen.getAllByRole("link")).toHaveLength(hrefs.length);

    for (const other of cards.slice(1)) {
      expect(toggleIn(other)).toHaveAttribute("aria-expanded", "false");
      expect(within(other).queryAllByRole("link")).toHaveLength(0);
    }
  });

  it("leaves an already open card open when a second is opened", () => {
    // Not an accordion. Opening one story must not close another the reader
    // is still reading, and expansion state belongs to each card alone.
    renderEdition();

    const toggles = screen.getAllByRole("button");
    const first = present(toggles[0], "the first card's toggle");
    const third = present(toggles[2], "the third card's toggle");

    fireEvent.click(first);
    fireEvent.click(third);

    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(third).toHaveAttribute("aria-expanded", "true");
    expect(present(toggles[1], "the second card's toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("what an expanded card leaves on the device", () => {
  it("stores exactly the expanded stories, under this edition's date", () => {
    /*
      The positive counterpart of the assertion this file used to carry. Until
      AB-301 landed, "persists nothing to the device" was the executable
      statement that the durable half had not been built; replacing it with
      "now, and exactly this" is the seam closing correctly. `EditionView` is
      unchanged either way — the hook's signature did not move.
    */
    renderEdition();

    const toggles = screen.getAllByRole("button");
    fireEvent.click(present(toggles[0], "the first card's toggle"));
    fireEvent.click(present(toggles[1], "the second card's toggle"));

    expect(storedIdsFor(edition.date)).toEqual(
      [coreStoryAt(0).id, coreStoryAt(1).id].sort(),
    );
    // One key, the documented one, and nothing else anywhere: the edition
    // date, the ordering, and the reader are not written down.
    expect(localStorage.length).toBe(1);
    expect(sessionStorage.length).toBe(0);
  });

  it("restores the viewed set on the first render after a remount", () => {
    /*
      A reload proxy, and the limitation is worth stating: unmounting and
      rendering again destroys the React tree but keeps the same JavaScript
      realm, so it proves the state came back off the device rather than out of
      a closure — but it is not a browser reload, which would also re-evaluate
      the bundle. A real reload needs Playwright, which section 5 lists as not
      installed and requiring an ADR to add.

      Asserted on the remounted tree's FIRST render, which is the version of
      that claim that can fail. `render` is wrapped in `act`, so an
      implementation that loaded in an effect has already settled by the time
      any assertion runs, and reading the latest value cannot see the empty set
      it showed on the way — the one AB-203's counter would render before
      correcting itself.
    */
    const first = renderEdition();
    fireEvent.click(
      present(screen.getAllByRole("button")[0], "the first card's toggle"),
    );
    first.unmount();

    // So that `results[0]` is the remount's first render rather than the
    // original mount's, which was legitimately empty.
    vi.mocked(useViewedStories).mockClear();
    renderEdition();

    expect(viewedIdsOnFirstRender()).toEqual([coreStoryAt(0).id]);
    expect(viewedIds()).toEqual([coreStoryAt(0).id]);
    // And the cards themselves start collapsed: what survives is the record of
    // what was opened, not the shape of the page the reader left behind.
    // Scoped to the cards: the end-edition control is a button on this page too,
    // and it is not a disclosure.
    for (const card of storyCards()) {
      expect(toggleIn(card)).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("expands normally, and says nothing to the reader, when the write is refused", () => {
    // Quota exhaustion, or an origin that refuses writes. The reader was never
    // promised that the edition remembers anything, so the failure degrades to
    // the fresh-device experience rather than to a message on a page whose job
    // is today's news.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { container } = renderEdition();
      const toggle = present(
        screen.getAllByRole("button")[0],
        "the first card's toggle",
      );
      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(viewedIds()).toEqual([coreStoryAt(0).id]);
      // The whole edition is still on the page, and nothing on it mentions
      // storage. Counted by headline rather than by list item: an expanded
      // card contributes its own source list, so list items are no longer the
      // count of stories once one is open.
      expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(10);
      expect(container).not.toHaveTextContent(/storage|saved|offline/i);
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("recording which stories were viewed", () => {
  it("marks a story viewed when the reader expands its card", () => {
    /*
      The wire this suite could not otherwise see. `StoryCard` proves it calls
      `onExpand`, and `useViewedStories` proves it records what it is told, but
      until this assertion existed both could be true while `EditionView`
      handed the card a callback that did nothing — which is the acceptance
      criterion for this slice, silently unmet.
    */
    renderEdition();
    expect(viewedIds()).toEqual([]);

    const cards = storyCards();
    fireEvent.click(toggleIn(present(cards[1], "the second card")));
    fireEvent.click(toggleIn(present(cards[4], "the fifth card")));

    expect(viewedIds()).toEqual([coreStoryAt(1).id, coreStoryAt(4).id]);
  });

  it("keeps the viewed set to this edition's date", () => {
    // What stops one edition's viewed stories from ever being counted as
    // another's, whichever way the reader navigates between them.
    renderEdition();

    expect(useViewedStories).toHaveBeenCalledWith(edition.date);
    expect(viewedNow().viewed.editionDate).toBe(edition.date);
  });

  it("leaves a story viewed after the reader collapses it again", () => {
    // Viewed is monotonic: collapsing a card says nothing about whether it was
    // read, and un-marking it would make the record one of how the reader
    // browsed rather than of what they opened.
    renderEdition();

    const first = present(storyCards()[0], "the first card");
    // Held rather than re-queried: an expanded card has a second button in it,
    // and React keeps this node across the re-render either way.
    const toggle = toggleIn(first);
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(viewedIds()).toEqual([coreStoryAt(0).id]);
  });

  it("marks nothing while every card is still collapsed", () => {
    renderEdition();

    expect(viewedIds()).toEqual([]);
  });
});

describe("how much of the edition has been opened", () => {
  it("counts the edition from zero, before the reader has opened anything", () => {
    /*
      Present on the first render, not conjured by the first expand. A counter
      that materialised when the reader opened a story would be a thing they
      made happen — a micro-reward — and its first appearance would read as a
      score rather than as the size of what is in front of them.

      The denominator is read back out of the DOM rather than written here as
      an eight, for the same reason the card ordinals are: a test carrying its
      own constant cannot tell "0 of 8 viewed" over eight cards from the same
      sentence over ten.
    */
    renderEdition();

    expect(screen.getByText(`0 of ${cardCount()} viewed`)).toBeInTheDocument();
  });

  it("counts against the same denominator the cards number themselves against", () => {
    // The one number the reader sees twice. "3 of 10 viewed" above a list whose
    // last card says "8 of 8" tells them two stories exist somewhere they
    // cannot reach, which is the hidden backlog constitution 1 forbids — and
    // two independently derived denominators are two chances to say it.
    const { container } = renderEdition();

    const cards = storyCards();
    const total = cards.length;
    cards.forEach((card, index) => {
      expect(
        within(card).getByText(`${index + 1} of ${total}`),
      ).toBeInTheDocument();
    });

    const counted = /^\d+ of (\d+) viewed$/.exec(
      progressLine(container).textContent ?? "",
    );
    expect(present(counted, "a progress sentence")[1]).toBe(String(total));
  });

  it("counts each story the reader expands, once", () => {
    const { container } = renderEdition();
    const total = cardCount();

    const cards = storyCards();
    fireEvent.click(toggleIn(present(cards[0], "the first card")));
    fireEvent.click(toggleIn(present(cards[3], "the fourth card")));

    expect(progressLine(container)).toHaveTextContent(`2 of ${total} viewed`);
  });

  it("does not count a stored story that is not on this page", () => {
    /*
      The AB-204 guard, at the level the reader would see it. The viewed set is
      keyed by edition date, not by what this render put on screen, so a reader
      whose interests changed between visits has stored ids for pool stories
      this render does not include. Counting the stored set's size would print
      a numerator the reader cannot reconcile with anything in front of them,
      and in the worst case one larger than the denominator.
    */
    rememberViewed(wideEdition.date, coreStoryAt(0).id);
    rememberViewed(wideEdition.date, unseenPoolStory.id);

    const { container } = renderEdition({ edition: wideEdition });

    const total = cardCount();
    expect(progressLine(container)).toHaveTextContent(`1 of ${total} viewed`);
    expect(progressLine(container)).not.toHaveTextContent(
      `2 of ${total} viewed`,
    );
  });

  it("is a sentence with nothing beside it, never a bar", () => {
    /*
      `role="progressbar"` and `aria-valuenow` are asserted absent just below,
      and they are exactly what a bar can be built without: a styled `<div>`
      37.5% wide has neither, no accessible name to query it by, and no text to
      catch it with. A percentage inside the SENTENCE is caught by the sentence;
      a bar drawn next to it is not.

      So this asserts the shape instead, in the two places a bar has to be. It
      has to sit beside the number it fills against, so the counter's neighbours
      are named: the freshness line above, the story list below, nothing
      between. And it has to express a fill as a length, so nothing in the
      edition carries an inline width — the one form a dynamic percentage cannot
      avoid, since a stylesheet cannot know the number.

      Why it matters rather than being a style preference: a bar is a thing to
      complete, and a filling bar is a reward waiting to be collected, which is
      the mechanic section 3.2 rules out. The sentence is a fact the reader
      could check by counting the cards.
    */
    const { container } = renderEdition();
    const counter = progressLine(container);

    expect(counter.textContent).toBe(`0 of ${cardCount()} viewed`);
    // Text and no elements: nothing is nested inside the sentence either.
    expect(counter.children).toHaveLength(0);
    expect(counter.previousElementSibling).toHaveClass("edition-freshness");
    expect(counter.nextElementSibling).toBe(screen.getByRole("list"));

    for (const styled of container.querySelectorAll("[style]")) {
      expect(styled.getAttribute("style")).not.toMatch(/width|%/);
    }
  });

  it("keeps the count out of the live region", () => {
    // The counter is a fact on the page, not an announcement. A count that
    // spoke every time the reader opened a story would turn expanding a card
    // into a scored event, which is the mechanic section 3.2 rules out — and
    // the shell's status region is the obvious place a later edit would put it.
    const { container } = renderEdition();
    // Read while every card is shut: an expanded card contributes its own
    // source list, so list items stop being the count of stories once one is
    // open.
    const total = cardCount();

    const cards = storyCards();
    fireEvent.click(toggleIn(present(cards[0], "the first card")));
    fireEvent.click(toggleIn(present(cards[1], "the second card")));

    expect(progressLine(container)).toHaveTextContent(`2 of ${total} viewed`);
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("ending the edition", () => {
  it("says so without comment when the reader read nothing at all", () => {
    /*
      Acceptance criterion 1 at its extreme: a reader may end before the tenth
      story, including before the first. Zero is deliberately not special-cased
      — a distinct message for a reader who read little would be the product
      commenting on how little they read, and PRD section 5.1 is explicit that
      ending early must not tell the reader they failed.
    */
    renderEdition();
    const total = cardCount();

    pressEnd();

    expect(
      screen.getByText(`You read 0 of ${total}. That can be enough for today.`),
    ).toBeInTheDocument();
    expect(endControl()).toBeNull();
  });

  it("leaves every story where it was, including the open ones", () => {
    /*
      What makes an irreversible control defensible. Ending removes the control
      and shows a sentence; it does not clear the page, collapse what the
      reader opened, or lock anything. A reader who ends and keeps reading is
      doing something the product allows, so there is nothing to undo.
    */
    renderEdition();

    const cards = storyCards();
    const first = toggleIn(present(cards[0], "the first card"));
    const third = toggleIn(present(cards[2], "the third card"));
    fireEvent.click(first);
    fireEvent.click(third);

    // Counted after the expands and before the ending, so the comparison is
    // about what ENDING changed. Taking it before would also fold in the
    // interest invitation, which the second expand legitimately brings onto the
    // page and which has nothing to do with the claim under test.
    const headlinesBefore = screen.getAllByRole("heading", { level: 2 }).length;

    pressEnd();

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(
      headlinesBefore,
    );
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(third).toHaveAttribute("aria-expanded", "true");
  });

  it("opens no new way out of the edition", () => {
    // The end of the edition adds nothing to click away to: no next edition,
    // no archive, no related reading, no share (section 3.1). Counted against
    // the links an expanded card legitimately contributes, so this is about
    // what ending adds rather than about the page being empty.
    renderEdition();
    fireEvent.click(toggleIn(present(storyCards()[0], "the first card")));
    const linksBefore = screen.getAllByRole("link").length;
    expect(linksBefore).toBeGreaterThan(0);

    pressEnd();

    expect(screen.getAllByRole("link")).toHaveLength(linksBefore);
  });

  it("marks no story viewed", () => {
    // Ending is not reading. The count the reader is shown has to be what they
    // actually opened, or the sentence about it is untrue.
    renderEdition();

    pressEnd();

    expect(viewedIds()).toEqual([]);
    expect(storedIdsFor(edition.date)).toEqual([]);
    expect(endedNow().hasEnded).toBe(true);
  });

  it("is the last thing in the edition, with nothing after it", () => {
    // Rendered inside a `main` so the placement can be asserted where the shell
    // will put it. Nothing continues the edition, so nothing follows the
    // ending: it is the bottom of the document, and the shell's footer is
    // outside `main` entirely.
    render(
      <main>
        <EditionView
          edition={edition}
          freshness="current"
          source="network"
          copyDate={null}
        />
      </main>,
    );

    const main = screen.getByRole("main");
    const sequence = (): string[] =>
      [...main.children].map((child) => child.className || child.tagName);

    /*
      The whole sequence, not just the ending's neighbour.

      A `previousElementSibling` check says only what is directly above the
      ending, so anything inserted higher up — a second list, a recommendation
      strip, a prompt between the counter and the stories — passes it. Listing
      the children names every position instead, which is what makes "nothing
      continues the edition" an assertion about the page rather than about one
      gap in it.
    */
    expect(sequence()).toEqual([
      "H1",
      "edition-freshness",
      "edition-progress",
      "edition-stories",
      "edition-ending",
    ]);

    // And again once the interest invitation is on the page: it takes the one
    // slot between the list and the ending, and the ending is still last.
    const cards = storyCards();
    fireEvent.click(toggleIn(present(cards[0], "the first card")));
    fireEvent.click(toggleIn(present(cards[1], "the second card")));

    expect(sequence()).toEqual([
      "H1",
      "edition-freshness",
      "edition-progress",
      "edition-stories",
      "interest-boosts",
      "edition-ending",
    ]);
    expect(main.lastElementChild).toHaveClass("edition-ending");
  });

  it("stays ended on the first render after a remount", () => {
    /*
      Acceptance criterion 3. The same reload proxy, with the same limitation,
      as the viewed set above: unmounting and rendering again destroys the React
      tree but keeps the same JavaScript realm, so it proves the flag came back
      off the device rather than out of a closure — it is not a browser reload,
      which would also re-evaluate the bundle. A real reload needs Playwright,
      which section 5 lists as not installed and requiring an ADR to add.

      Asserted on the remounted tree's FIRST render, which is the version of the
      claim that can fail: there must be no render in which a reader who already
      ended is offered the control again before it disappears.
    */
    const first = renderEdition();
    pressEnd();
    first.unmount();

    // So that `results[0]` is the remount's first render rather than the
    // original mount's, which was legitimately not ended.
    vi.mocked(useEditionEnded).mockClear();
    renderEdition();

    expect(endedOnFirstRender()).toBe(true);
    expect(endControl()).toBeNull();
    expect(
      screen.getByText(
        `You read 0 of ${cardCount()}. That can be enough for today.`,
      ),
    ).toBeInTheDocument();
  });

  it("ends each edition with its own freshness's words", () => {
    /*
      The wire, not the table. `endingCopy` is exercised over all three
      freshnesses in `edition-progress.test.ts` and `EditionEnding` over all
      three from props — and both stay green while this component hands the
      ending a constant, because neither of them can see what it passes.

      What a constant does to a reader: with "current" hardcoded, an ARCHIVED
      edition ends "That's today's edition." and "See you tomorrow.", on the
      same page as the notice reading "This is a past edition." That is a false
      statement about which day is on screen — section 26's rule against
      presenting stale content as current, applied to copy — plus an invitation
      to come back tomorrow for an edition that is already old. With "archived"
      hardcoded, today's edition ends without saying there is a tomorrow at all.

      Asserted as the block's whole text, so the two halves that differ by
      freshness — the message and the line about what follows — are both
      covered, and the label is checked before the press because it is the third
      thing the table varies.
    */
    const endings: readonly {
      readonly freshness: EditionFreshness;
      readonly label: string;
      readonly ended: (total: number) => string;
    }[] = [
      {
        freshness: "current",
        label: "End today's edition",
        ended: (total) =>
          `You read 0 of ${total}. That can be enough for today.See you tomorrow.`,
      },
      {
        freshness: "stale",
        label: "End this edition",
        ended: (total) =>
          `You read 0 of ${total}. That can be enough for today.The next edition will appear here when it is published.`,
      },
      {
        freshness: "archived",
        label: "End this edition",
        // No line about what follows: the reader chose a past date, and "See
        // you tomorrow." there is an invitation rather than an ending.
        ended: (total) =>
          `You read 0 of ${total}. That can be enough for today.`,
      },
    ];

    for (const { freshness, label, ended } of endings) {
      const { container } = renderEdition({ freshness });
      const total = cardCount();

      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      pressEnd();

      expect(endingBlock(container).textContent).toBe(ended(total));

      cleanup();
      localStorage.clear();
    }
  });

  it("keeps the ending to the edition whose date it is", () => {
    /*
      Ending is a fact about ONE edition, keyed by its date. Keyed by anything
      else — a constant, the last edition opened, the reader — ending today's
      renders every other edition already ended too, including archive dates the
      reader has never opened: a claim about what they did that is simply false,
      and the accumulating cross-edition flag section 3.5 and `edition-ended.ts`
      both say this state must never become.

      Two dates rather than one, because a single edition cannot tell the
      difference: the remount test above passes just as well against a hardcoded
      key.
    */
    const other: Edition = { ...edition, date: "2026-07-20" };

    const today = renderEdition();
    pressEnd();
    expect(endControl()).toBeNull();
    today.unmount();

    renderEdition({ edition: other, freshness: "archived" });

    expect(useEditionEnded).toHaveBeenCalledWith(other.date);
    // Untouched: the edition the reader has not ended still offers its ending,
    // and says nothing about having been read.
    expect(endControl()).toBeInTheDocument();
    expect(screen.queryByText(/That can be enough for today/)).toBeNull();
    expect(screen.queryByText(/That's the whole edition/)).toBeNull();
  });

  it("adds no control of its own to the page it ends", () => {
    /*
      Irreversibility is a load-bearing product claim, and this is the level it
      is easy to break at. `EditionEnding` proves the ending offers no way back;
      a "Reopen the edition" control placed a line above it in THIS file leaves
      every one of those assertions green.

      Counted rather than named, because the claim is that nothing was added —
      an un-end, a share, an install prompt, a survey, a "read yesterday's" —
      not that one particular string is absent. Every button left on the page is
      a card's disclosure, which is what makes the count an argument rather than
      a number that happens to match.

      The interest picker is excluded by NAME rather than by count, and the
      distinction matters. Ending the edition is one of PRD section 7.1's two
      triggers for the invitation, so its controls appear here legitimately and
      an unscoped count would simply absorb them — along with anything else a
      later slice put beside them. Excluding one named block keeps the rest of
      the page counted, so a control added anywhere outside it still fails.
    */
    const { container } = renderEdition();
    const cards = cardCount();
    const outsideThePicker = (): HTMLElement[] =>
      screen
        .getAllByRole("button")
        .filter((button) => button.closest(".interest-boosts") === null);

    // The cards' toggles, plus the one control that ends the edition.
    expect(outsideThePicker()).toHaveLength(cards + 1);

    pressEnd();

    const remaining = outsideThePicker();
    expect(remaining).toHaveLength(cards);
    for (const button of remaining) {
      expect(button).toHaveAttribute("aria-expanded");
    }

    // And the picker really is the only other thing on the page, so the filter
    // above cannot be hiding a control that was smuggled in beside it.
    expect(container.querySelectorAll(".interest-boosts").length).toBe(1);
  });

  it("stays ended when the reader keeps reading afterwards", () => {
    /*
      The flow the slice explicitly allows: end the edition, then open another
      story. Ending is non-destructive — the stories stay exactly where they
      were — so reading on is something the reader may do, and the write that
      records the story they opened shares one document on the device with the
      ended flag.

      Asserted across a remount because the damage is invisible until then: the
      React state is already true, so the edition looks ended for the rest of
      the session and comes back un-ended, with the control offered again on an
      edition the reader has already finished with.
    */
    const first = renderEdition();
    pressEnd();
    fireEvent.click(toggleIn(present(storyCards()[0], "the first card")));
    expect(endControl()).toBeNull();
    first.unmount();

    vi.mocked(useEditionEnded).mockClear();
    renderEdition();

    expect(endedOnFirstRender()).toBe(true);
    expect(endControl()).toBeNull();
    // And the story opened after ending is still on the device: neither write
    // erased the other.
    expect(storedIdsFor(edition.date)).toEqual([coreStoryAt(0).id]);
  });

  it("keeps saying what the reader has read as they keep reading", () => {
    /*
      Ending after one story says "You read 1 of 8."; opening the remaining
      seven turns the same block into "That's today's edition." The number is
      DERIVED from the viewed set on every render rather than frozen at the
      press, and that is a decision, not an oversight — it is recorded here
      because nothing else in the slice records it.

      Freezing it would mean storing a second fact, how much had been read at
      the moment the control was pressed, and then printing a number that
      contradicts the page it sits on: "You read 1 of 8." beneath eight open
      cards. The block states what is true now. Completion wins over ending
      early for the same reason: a reader who went on to open everything did
      read the whole edition, and telling them otherwise would be the less
      accurate sentence.

      Nothing about the change is announced or rewarded — no live region here,
      and no focus move for it in `EditionEnding` — so the sentence is simply
      different when the reader next looks at it.
    */
    const { container } = renderEdition();
    const cards = storyCards();
    const total = cards.length;

    fireEvent.click(toggleIn(present(cards[0], "the first card")));
    pressEnd();

    expect(endingBlock(container).textContent).toBe(
      `You read 1 of ${total}. That can be enough for today.See you tomorrow.`,
    );

    // Held from before the first expand: an open card has a second button in
    // it, so `toggleIn` only answers for a card that is still shut — which each
    // of these is at the moment it is clicked.
    for (const card of cards.slice(1)) {
      fireEvent.click(toggleIn(card));
    }

    expect(endingBlock(container).textContent).toBe(
      "That's today's edition.See you tomorrow.",
    );
    expect(progressLine(container)).toHaveTextContent(
      `${total} of ${total} viewed`,
    );
  });
});

describe("choosing interest boosts", () => {
  /*
    The wiring, at the level the acceptance criteria are written at. The picker
    itself is proved in `InterestBoosts.test.tsx` against props; what can only
    be proved here is that the reader's answer reaches the story list, and that
    it reaches it at the right MOMENT.
  */

  function invitation(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".interest-boosts");
  }

  function chooseSports(): void {
    fireEvent.click(screen.getByRole("checkbox", { name: "Sports" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save interest boosts" }),
    );
  }

  function expand(index: number): void {
    fireEvent.click(
      toggleIn(present(storyCards()[index], `card ${index + 1}`)),
    );
  }

  it("does not ask before the reader has expanded two stories", () => {
    // PRD section 7.1 forbids blocking the first edition with topic selection,
    // and one expand is not yet evidence the reader is using the product.
    renderEdition();
    expect(invitation()).toBeNull();

    expand(0);
    expect(invitation()).toBeNull();
  });

  it("asks after the second expanded story", () => {
    renderEdition();

    expand(0);
    expand(1);

    expect(invitation()).not.toBeNull();
    expect(
      screen.getByRole("group", { name: "Choose up to two" }),
    ).toBeInTheDocument();
  });

  it("asks at the end of the edition even if the reader expanded nothing", () => {
    // Section 7.1's second trigger. A reader who ends early is still a reader
    // who reached the end, and it is the only other moment the product has.
    renderEdition();
    expect(invitation()).toBeNull();

    pressEnd();

    expect(invitation()).not.toBeNull();
  });

  it("never asks on a past edition", () => {
    /*
      The same silence `endingCopy` keeps about tomorrow on an archived date.
      A reader who deliberately opened an old edition came for that date, and a
      question about future editions there is a nudge to come back rather than
      an answer to what they asked for.
    */
    renderEdition({ freshness: "archived" });
    pressEnd();

    expect(invitation()).toBeNull();
  });

  it("composes the edition from a choice already on the device, on the first render", () => {
    /*
      Acceptance criterion: the choice has to be in effect before anything is
      painted. An effect-loaded read would render the unboosted ten and then
      swap two of them, which is a content shift under the reader's thumb —
      worse than AB-203's counter blinking, because the LIST changes.
    */
    renderEdition({ edition: twoPoolEdition });
    const withoutInterests = renderedHeadlines();

    cleanup();
    localStorage.clear();
    rememberInterests(["sports"]);

    renderEdition({ edition: twoPoolEdition });
    const withSports = renderedHeadlines();

    expect(withSports).toHaveLength(10);
    expect(withSports).not.toEqual(withoutInterests);
    // The shared core is untouched: a preference may change which pooled
    // stories arrive, never the ranking of the eight everyone sees.
    expect(withSports.slice(0, 8)).toEqual(withoutInterests.slice(0, 8));
  });

  it("still renders ten stories for a reader who has chosen nothing", () => {
    /*
      The criterion "first edition is usable without choosing interests", and
      the constitutional half of it. If a reader without interests saw eight,
      choosing would take them to ten and the invitation would be a prompt whose
      payoff is more content — an engagement reward (section 3.2). Interests
      change WHICH two, never HOW MANY.
    */
    renderEdition();

    expect(cardCount()).toBe(10);
  });

  it("falls back to the shared core when the device holds a document it cannot read", () => {
    // The third acceptance criterion. A corrupt document is not a broken
    // screen: the reader gets the same ten a fresh device gets.
    localStorage.setItem(LOCAL_STATE_KEY, "{ this is not json");

    renderEdition();

    expect(cardCount()).toBe(10);
    expect(renderedHeadlines().slice(0, 8)).toEqual(coreHeadlines);
  });

  it("does not recompose the edition the reader is already reading", () => {
    /*
      THE test of this slice.

      If saving re-selected the pooled stories in place, the list would change
      under a reader who has already read part of it, the denominator would
      move, and the ending message could flip back to unfinished. That is "two
      more stories unlocked" delivered as a mechanic, whatever the copy calls
      it. The picker's own words promise the choice applies to the next edition
      opened, and this is the assertion that makes the sentence true.
    */
    const { container } = renderEdition({ edition: twoPoolEdition });
    expand(0);
    expand(1);
    const before = renderedHeadlines();
    const counterBefore = progressLine(container).textContent;

    chooseSports();

    expect(renderedHeadlines()).toEqual(before);
    expect(progressLine(container).textContent).toBe(counterBefore);
  });

  it("applies the choice to the next edition the reader opens", () => {
    // The other half of the promise: deferred is not discarded.
    renderEdition({ edition: twoPoolEdition });
    const before = renderedHeadlines();
    pressEnd();
    chooseSports();

    cleanup();
    renderEdition({ edition: twoPoolEdition });

    expect(renderedHeadlines()).not.toEqual(before);
  });

  it("stores the choice and nothing else about the reader", () => {
    renderEdition();
    pressEnd();
    chooseSports();

    const stored = localStateV1Schema.parse(
      JSON.parse(
        present(localStorage.getItem(LOCAL_STATE_KEY), "the document"),
      ),
    );

    expect(stored.interests).toEqual(["sports"]);
    // No timestamp, no dismissal flag, no count of how many times we asked.
    expect(Object.keys(stored).sort()).toEqual([
      "endedEditions",
      "interests",
      "schemaVersion",
      "viewedByEdition",
    ]);
  });

  it("stops asking a reader who declined, without storing that they refused", () => {
    /*
      "No thanks" is stored as choosing nothing, which is why there is no
      dismissal flag in this slice: an absent field means never asked, an empty
      array means asked and answered. Anything else would either re-ask on every
      load or keep a record of a refusal.
    */
    renderEdition();
    pressEnd();
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    // Re-rendered without pressing anything: the edition is already ended on
    // the device, so the trigger is met on the first render. If declining had
    // stored nothing, this is exactly where the question would come back.
    cleanup();
    renderEdition();

    expect(endControl()).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Choose up to two" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Change interest boosts" }),
    ).toBeInTheDocument();
  });
});
