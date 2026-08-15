import {
  CORE_STORY_COUNT,
  INTEREST_STORY_COUNT,
  type Edition,
  type InterestSlug,
  type Story,
} from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import { editionStories } from "./edition-stories";
import source from "./edition-stories.ts?raw";

/**
 * The pools an edition declares, before the stories to match them exist.
 *
 * The fixture edition offers one story per pool, which cannot tell "one story
 * from each of two chosen pools" apart from "both stories from whichever pool
 * came first" — the mutation most of this file exists to catch. So the pools
 * are declared per test and the stories are generated to fit them.
 */
type Pools = Partial<Record<InterestSlug, string[]>>;

/** Ids chosen so that alphabetical order is visible in the test, and so that a
 * tie-break on the pool's position in `INTEREST_SLUGS` would give a different
 * answer from a tie-break on the id. */
const SPORT_1 = "pool-a-sport";
const SPORT_2 = "pool-b-sport";
const TECH_1 = "pool-c-tech";
const TECH_2 = "pool-d-tech";
const CULTURE_1 = "pool-e-culture";

/** Sorts before every id above, so a pool nobody may choose from cannot win by
 * accident when the test below expects it to lose. */
const INDIA_1 = "pool-0-india";

function poolStory(id: string, topic: InterestSlug): Story {
  const template = validEdition().stories[0];

  if (template === undefined) {
    throw new Error("the fixture edition carries no story to model on");
  }

  return { ...template, id, slug: id, topic };
}

/** `Object.entries` over a partial record, narrowed the way the schema does. */
function poolEntries(pools: Pools): [InterestSlug, string[]][] {
  return Object.entries(pools).filter(
    (entry): entry is [InterestSlug, string[]] => entry[1] !== undefined,
  );
}

/**
 * A pool key no interest names, cast at one boundary on purpose.
 *
 * The schema keys `interestPools` by `InterestSlug`, so a well-typed edition
 * cannot carry `india` — and the guard being tested exists precisely for the
 * document that got past the schema. The cast is confined here so that no
 * assertion below has to hide one.
 */
function withForeignPool(pools: Pools, foreign: Record<string, string[]>) {
  return { ...pools, ...foreign } as Pools;
}

/** An edition with exactly these pools, carrying a story for every id they name. */
function editionWithPools(pools: Pools): Edition {
  const base = validEdition();
  const core = new Set(base.coreStoryIds);

  const pooled = new Map<string, Story>();
  for (const [interest, ids] of poolEntries(pools)) {
    for (const id of ids) {
      if (!core.has(id)) {
        pooled.set(id, poolStory(id, interest));
      }
    }
  }

  return {
    ...base,
    interestPools: pools,
    stories: [
      ...base.stories.filter((story) => core.has(story.id)),
      ...pooled.values(),
    ],
  };
}

function idsOf(stories: readonly Story[]): string[] {
  return stories.map((story) => story.id);
}

/** The stories beyond the core: what this module actually decides. */
function pooledIds(
  edition: Edition,
  interests: readonly InterestSlug[],
): string[] {
  return idsOf(editionStories(edition, interests)).slice(CORE_STORY_COUNT);
}

/** Two pools of two, the smallest edition that can distinguish every rule below. */
function twoFullPools(): Edition {
  return editionWithPools({
    sports: [SPORT_1, SPORT_2],
    "technology-ai": [TECH_1, TECH_2],
  });
}

describe("editionStories", () => {
  it("gives a reader who has chosen nothing ten stories, not eight", () => {
    // Returning the core alone is the tempting reading of "no interests
    // chosen", and it is the wrong one: PRD section 5.2 promises ten
    // stories to every reader, and choosing interests changes which two
    // they are rather than whether there are two.
    const stories = editionStories(twoFullPools(), []);

    expect(stories).toHaveLength(CORE_STORY_COUNT + INTEREST_STORY_COUNT);
  });

  it("puts the core first, in the order coreStoryIds names", () => {
    // Sorting or interleaving the whole list would make the day's editorial
    // ranking depend on who is reading.
    const edition = twoFullPools();

    expect(idsOf(editionStories(edition, ["sports"])).slice(0, 8)).toEqual(
      edition.coreStoryIds,
    );
  });

  it("shows every reader the same eight core stories, whatever they chose", () => {
    const edition = twoFullPools();
    const core = idsOf(editionStories(edition, [])).slice(0, CORE_STORY_COUNT);

    for (const interests of [
      ["sports"],
      ["technology-ai"],
      ["sports", "technology-ai"],
      ["culture-entertainment"],
    ] satisfies InterestSlug[][]) {
      expect(
        idsOf(editionStories(edition, interests)).slice(0, CORE_STORY_COUNT),
      ).toEqual(core);
    }
  });

  it("prefers a chosen pool to an unchosen one", () => {
    // The assertion that the interests argument is read at all.
    expect(pooledIds(twoFullPools(), ["sports"])).toEqual([SPORT_1, SPORT_2]);
    expect(pooledIds(twoFullPools(), ["technology-ai"])).toEqual([
      TECH_1,
      TECH_2,
    ]);
  });

  it("takes one story from each of two chosen pools", () => {
    /*
      The block-filling mutation. Both pools are chosen and both have two
      stories, so an implementation that empties one pool before starting the
      next returns two sports stories and no technology at all — a reader who
      asked for both topics gets one of them. Position within the pool is the
      second sort key precisely so that this cannot happen.
    */
    expect(pooledIds(twoFullPools(), ["sports", "technology-ai"])).toEqual([
      SPORT_1,
      TECH_1,
    ]);
  });

  it("reads the interests as a set, not in the order they arrived", () => {
    // Argument order is a record of what the reader did, in sequence. Letting
    // it rank stories would be behavioural ranking arriving through the front
    // door (section 3.3).
    const edition = twoFullPools();

    expect(pooledIds(edition, ["sports", "technology-ai"])).toEqual(
      pooledIds(edition, ["technology-ai", "sports"]),
    );
  });

  it("ignores the order the pools were written into the edition file", () => {
    // `Object.keys(interestPools)[0]` would make the result depend on how the
    // JSON happened to be serialised.
    const forwards = editionWithPools({
      sports: [SPORT_1],
      "technology-ai": [TECH_1],
    });
    const backwards = editionWithPools({
      "technology-ai": [TECH_1],
      sports: [SPORT_1],
    });

    expect(pooledIds(forwards, [])).toEqual(pooledIds(backwards, []));
    expect(pooledIds(forwards, ["sports"])).toEqual(
      pooledIds(backwards, ["sports"]),
    );
  });

  it("reads only the pools the published vocabulary names", () => {
    /*
      What walking `INTEREST_SLUGS` actually buys, as opposed to what the loop
      is easily read as buying. Serialisation order cannot reach the output
      whatever the loop does, because the sort key carries no walk-order
      component — the test above passes under `Object.keys` in either
      direction. This is the property that does not: a pool key outside the
      vocabulary contributes no candidate, so `india`, which PRD section 5.3
      makes core coverage nobody opts into, cannot become an interest story by
      appearing in a pools object the schema would have refused.
    */
    const edition = editionWithPools(
      withForeignPool(
        { sports: [SPORT_1], "technology-ai": [TECH_1] },
        { india: [INDIA_1] },
      ),
    );

    expect(pooledIds(edition, [])).toEqual([SPORT_1, TECH_1]);
  });

  it("treats a repeated interest as the one interest it is", () => {
    const edition = twoFullPools();

    expect(pooledIds(edition, ["sports", "sports", "sports"])).toEqual(
      pooledIds(edition, ["sports"]),
    );
  });

  it("fills both places from one pool when that is the only interest chosen", () => {
    // The counterpart of the round-robin rule: sharing between pools happens
    // because two pools were chosen, not because one pool is capped at one.
    expect(pooledIds(twoFullPools(), ["sports"])).toEqual([SPORT_1, SPORT_2]);
  });

  it("fills the second place from an unchosen pool when the chosen one runs out", () => {
    const edition = editionWithPools({
      sports: [SPORT_1],
      "technology-ai": [TECH_1, TECH_2],
    });

    expect(pooledIds(edition, ["sports"])).toEqual([SPORT_1, TECH_1]);
  });

  it("fills from the unchosen pools when the chosen interest has no pool at all", () => {
    // An interest with no stories on the day is ordinary: the schema makes
    // pools partial for exactly this reason. It must cost the reader nothing.
    const edition = editionWithPools({
      "technology-ai": [TECH_1, TECH_2],
    });

    expect(pooledIds(edition, ["sports"])).toEqual([TECH_1, TECH_2]);
  });

  it("skips a pooled id the edition does not carry rather than returning a hole", () => {
    const edition = editionWithPools({
      sports: [SPORT_1, SPORT_2],
      "technology-ai": [TECH_1],
    });
    const missing = {
      ...edition,
      stories: edition.stories.filter((story) => story.id !== SPORT_1),
    };

    const stories = editionStories(missing, ["sports"]);

    expect(idsOf(stories).slice(CORE_STORY_COUNT)).toEqual([SPORT_2, TECH_1]);
    expect(stories.every((story) => story !== undefined)).toBe(true);
  });

  it("returns the core alone when the edition declares no pools", () => {
    // A degraded edition, and the honest answer is a short one. Nothing is
    // borrowed from the core or invented to reach ten.
    const stories = editionStories(editionWithPools({}), ["sports"]);

    expect(idsOf(stories)).toEqual(validEdition().coreStoryIds);
  });

  it("returns eight from a six-core edition rather than topping it up to ten", () => {
    /*
      The pooled count is a constant, never `10 - core.length`. Deriving it
      from the shortfall would pull four pooled stories into a broken edition
      to make it look complete, and the counter above the list would agree.
      Six plus two is the number that tells the truth about what was published.
    */
    const full = editionWithPools({
      sports: [SPORT_1, SPORT_2],
      "technology-ai": [TECH_1, TECH_2],
      "culture-entertainment": [CULTURE_1],
    });
    const dropped = full.coreStoryIds.slice(6);
    const degraded: Edition = {
      ...full,
      coreStoryIds: full.coreStoryIds.slice(0, 6),
      stories: full.stories.filter((story) => !dropped.includes(story.id)),
    };

    const stories = editionStories(degraded, ["sports"]);

    expect(stories).toHaveLength(6 + INTEREST_STORY_COUNT);
    expect(idsOf(stories).slice(6)).toEqual([SPORT_1, SPORT_2]);
  });

  it("never repeats a core story as an interest story", () => {
    // A pool naming a core id is invalid content, but the failure it would
    // cause is a reader seeing the same story twice in one edition.
    const edition = editionWithPools({
      sports: [SPORT_1],
      "technology-ai": [TECH_1],
    });
    const overlapping: Edition = {
      ...edition,
      interestPools: {
        sports: ["story-0", SPORT_1],
        "technology-ai": [TECH_1],
      },
    };

    const ids = idsOf(editionStories(overlapping, ["sports"]));

    expect(ids.filter((id) => id === "story-0")).toHaveLength(1);
    expect(ids.slice(CORE_STORY_COUNT)).toEqual([SPORT_1, TECH_1]);
  });

  it("returns a story listed in two pools once, and spends one place on it", () => {
    const edition = editionWithPools({
      sports: [SPORT_1],
      "technology-ai": [SPORT_1, TECH_1],
    });

    expect(pooledIds(edition, ["sports", "technology-ai"])).toEqual([
      SPORT_1,
      TECH_1,
    ]);
  });

  it("never returns more than the interest count, however many pools are full", () => {
    const edition = editionWithPools({
      sports: [SPORT_1, SPORT_2],
      "technology-ai": [TECH_1, TECH_2],
      "culture-entertainment": [CULTURE_1],
    });

    for (const interests of [
      [],
      ["sports"],
      ["sports", "technology-ai"],
      ["sports", "technology-ai", "culture-entertainment"],
    ] satisfies InterestSlug[][]) {
      expect(editionStories(edition, interests)).toHaveLength(
        CORE_STORY_COUNT + INTEREST_STORY_COUNT,
      );
    }
  });

  it("does not mutate the edition it was given", () => {
    // Sorting a pool array read off the parsed edition in place would reorder
    // the day's content for every later reader of the same object.
    const edition = twoFullPools();
    const before = structuredClone(edition);

    editionStories(edition, ["technology-ai"]);

    expect(edition).toEqual(before);
  });

  it("answers the same thing every time it is asked", () => {
    // No clock and no randomness: the same reader gets the same edition on a
    // reload, and on the next render.
    const edition = twoFullPools();
    const interests: InterestSlug[] = ["sports", "culture-entertainment"];

    const first = idsOf(editionStories(edition, interests));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(idsOf(editionStories(edition, interests))).toEqual(first);
    }
  });
});

/**
 * The module read as source text.
 *
 * Every test above asserts what this function does with the arguments it is
 * given. None of them can assert what it does NOT reach for, and that is the
 * whole of section 3.3's guarantee: a later slice that read the set of stories
 * the reader had already opened, or the device's stored state, and let either
 * one order the pools would pass all twenty of them. Behavioural ranking is
 * not a wrong answer, it is a right answer arrived at from the wrong inputs,
 * so the inputs are what is asserted here.
 *
 * Read through the bundler (`?raw`, Vite's own, typed by `vite/client`) rather
 * than through `node:fs`, which would need the ambient Node types this
 * repository deliberately does not install. `styles.test.ts` and
 * `index-html.test.ts` read their files the same way, and it resolves relative
 * to this file, so the test does not depend on a working directory.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const code = withoutComments(source);

/**
 * Every module specifier one file imports from.
 *
 * Anchoring on `from` alone misses `import "./x";`, and that is the form this
 * has to catch: a side-effect import pulls a whole module — and everything
 * that module imports — into what this code can reach, while binding no name
 * anyone would think to grep for. The dynamic form is matched for the same
 * reason.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s+|^\s*import\s+|\bimport\(\s*)"([^"]+)"/gm;

function importsIn(text: string): string[] {
  return [...text.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");
}

/** Every module the file imports from. */
const imported = importsIn(source);

describe("what the selection is allowed to know", () => {
  it("still contains the function these assertions are about", () => {
    /*
      The positive check, and it is load-bearing: every assertion below is an
      absence, and an empty string — a moved file, a `?raw` import that
      silently resolved to nothing — satisfies all of them at once.
    */
    expect(code).toContain("export function editionStories");
    expect(code).toContain("INTEREST_STORY_COUNT");
  });

  it("imports the content contracts and the core, and nothing else", () => {
    // The narrowest possible statement of the rule: with no other module in
    // scope there is nothing for a later change to reach through.
    expect(new Set(imported)).toEqual(
      new Set(["@aaj-bas/schemas", "./core-stories"]),
    );
  });

  it("reads no stored device state, no clock, and no randomness", () => {
    /*
      Comments are stripped first because they are where the rule is argued and
      therefore where the excluded names are written down; only what actually
      executes is examined. `styles.test.ts` strips its stylesheet's comments
      for the same reason.
    */
    expect(code).not.toMatch(/local-state/);
    expect(code).not.toMatch(/viewed/i);
    expect(code).not.toMatch(/LocalStateV\d/);
    expect(code).not.toMatch(/\bDate\b/);
    expect(code).not.toMatch(/Math\.random/);
  });
});

/**
 * The same question asked of everything the selection can reach.
 *
 * The block above reads ONE file, and one file is not where a ranking input
 * would arrive. `./core-stories` is on its allowlist and is a module like any
 * other: a line in there that read the reader's viewed set, and a sort key in
 * here that used it, would leave every assertion above green — the import
 * `edition-stories.ts` declares is still the permitted one, and the forbidden
 * name is in a file nothing inspects. Behavioural ranking would have entered
 * through the door the purity test itself holds open.
 *
 * So the closure is what is asserted. Starting at `edition-stories.ts`, every
 * relative import is followed and every file reached is read, which puts
 * `core-stories.ts` — and whatever a later slice adds beside it — under the
 * same rule by construction rather than by somebody remembering to add a
 * second test file.
 *
 * Read through `import.meta.glob`, Vite's own, for the reason the single-file
 * block uses `?raw`: `node:fs` would need the ambient Node types this
 * repository deliberately does not install. The glob resolves relative to this
 * file, so the walk does not depend on a working directory, and it is eager
 * because these are strings rather than modules — nothing here is executed.
 */
const ENTRY = "./edition-stories.ts";

const sources: Record<string, unknown> = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
);

/**
 * A path with its `.` and `..` segments folded away.
 *
 * The glob hands back keys relative to this file — `./core-stories.ts`,
 * `../local-state/local-state-store.ts` — and an import resolved from a file
 * in another directory arrives spelled differently. Folding both makes the two
 * spellings of one module comparable; the glob's own spelling is what the
 * assertions then report, because it says which directory the module is in.
 */
function canonicalPath(path: string): string {
  const folded: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." && folded.length > 0 && folded.at(-1) !== "..") {
      folded.pop();
      continue;
    }
    folded.push(segment);
  }

  return folded.join("/");
}

const byPath = new Map(
  Object.keys(sources).map((key) => [canonicalPath(key), key]),
);

function sourceOf(key: string): string {
  const text = sources[key];

  // A specifier that resolved to nothing is the vacuous pass this whole block
  // is arranged to prevent, so it is a thrown error rather than a skip.
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`no source was read for ${key}`);
  }

  return text;
}

/**
 * A relative specifier resolved to the key the glob knows it by.
 *
 * The extension candidates are tried in the order a bundler tries them,
 * because the graph has to be the one the application actually loads rather
 * than the one this test finds convenient.
 */
function resolveModule(from: string, specifier: string): string {
  const directory = canonicalPath(from).split("/").slice(0, -1).join("/");
  const target = canonicalPath(`${directory}/${specifier}`);

  const key = [
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
    target,
  ]
    .map((candidate) => byPath.get(candidate))
    .find((candidate) => candidate !== undefined);

  if (key === undefined) {
    throw new Error(`${from} imports ${specifier}, which resolved to nothing`);
  }

  return key;
}

/** Every file reachable from `entry` by relative import, as source text. */
function moduleGraph(entry: string): Map<string, string> {
  const closure = new Map<string, string>();
  const pending = [entry];

  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || closure.has(key)) {
      continue;
    }

    const text = withoutComments(sourceOf(key));
    closure.set(key, text);

    for (const specifier of importsIn(text)) {
      // Workspace packages are not walked: `@aaj-bas/schemas` is the content
      // contract, it is asserted separately above, and the rule being enforced
      // here is about what the reader's own application can reach.
      if (specifier.startsWith(".")) {
        pending.push(resolveModule(key, specifier));
      }
    }
  }

  return closure;
}

describe("everything the selection can reach", () => {
  const graph = moduleGraph(ENTRY);

  it("is the two modules it is supposed to be, and both were really read", () => {
    /*
      The positive half, and it carries two jobs. It fails if the walk resolved
      nothing — every assertion below is an absence and an empty closure
      satisfies all of them — and it fails if a later change gives the
      selection a third module to reach, which is the point at which somebody
      has to say what that module is for.
    */
    expect([...graph.keys()].sort()).toEqual([
      "./core-stories.ts",
      "./edition-stories.ts",
    ]);
    for (const text of graph.values()) {
      expect(text).toContain("export function");
    }
  });

  it("imports nothing from the device or the reader, anywhere in the graph", () => {
    // Not one file's allowlist but every file's: the store is one hop from
    // here through any module on that allowlist, and a hop is all a sort key
    // needs to start ranking by what the reader has already opened.
    const offences = [...graph].flatMap(([key, text]) =>
      importsIn(text)
        .filter((specifier) => /(^|[./])(local-state|reader)\//.test(specifier))
        .map((specifier) => `${key} imports ${specifier}`),
    );

    expect(offences).toEqual([]);
  });

  it("reads no stored device state, no clock, and no randomness, anywhere in the graph", () => {
    // The same patterns the single-file block applies, applied to every file
    // the selection can reach. Comments are stripped by `moduleGraph` first,
    // for the reason given there: they are where the rule is argued.
    const forbidden = [
      /local-state/,
      /viewed/i,
      /LocalStateV\d/,
      /\bDate\b/,
      /Math\.random/,
      /performance\.now/,
      /\bcrypto\b/,
    ];

    const offences = [...graph].flatMap(([key, text]) =>
      forbidden
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${key} matches ${pattern.source}`),
    );

    expect(offences).toEqual([]);
  });
});
