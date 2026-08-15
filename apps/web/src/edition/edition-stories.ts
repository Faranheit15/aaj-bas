/**
 * The stories one reader sees: the shared core, then up to two of their own.
 *
 * `coreStories` fixes the eight every reader gets. This adds the rest of PRD
 * section 5.2 — up to `INTEREST_STORY_COUNT` more, drawn from the interest
 * pools — and it is the only place in the reader where two people are shown
 * different stories, so it is where the product's ranking commitments have to
 * hold.
 *
 * Section 3.3 is structural here rather than asserted. The signature takes an
 * edition and a list of interest slugs and nothing else: no clock, no
 * randomness, and no argument through which anything the reader has done on
 * their device could arrive. The interests are read as a SET — membership only,
 * never the order they were handed over in — so a caller that recorded the
 * order the reader ticked the boxes still could not turn that record into a
 * ranking. Two readers who chose the same interests get the same stories, and
 * they get them again tomorrow.
 *
 * The whole selection is one sort key, `(chosen, position, id)`. Three
 * behaviours that look like separate features are consequences of it, and are
 * deliberately not written as branches:
 *
 * - A reader who has chosen nothing is not a special case. Every candidate is
 *   then equally unchosen, and the same sort produces one default pair for
 *   everyone. A branch on the empty list would leave the default path free to
 *   drift away from the chosen one, and the default path is the one most
 *   readers are on.
 * - Two chosen pools yield one story each. `position` is the second key, so the
 *   first story of every chosen pool outranks the second story of any of them.
 *   Round-robin is what the key does, not a rule anybody has to maintain.
 * - An absent or empty pool costs nothing. It contributes no candidate, and the
 *   slot goes to whoever is next in the same order.
 *
 * The last key is the story id, NOT the position of the interest in
 * `INTEREST_SLUGS`. Breaking ties on that constant would make its declaration
 * order assert that technology outranks sport — an editorial claim the PRD
 * never makes, arrived at by a code decision nobody reviews, which is exactly
 * what section 22 rules out. An id is arbitrary and reads as arbitrary, which
 * is the honest tie-break; the edition rules in `packages/domain` break theirs
 * the same way.
 *
 * Pooled stories are appended, never interleaved. `coreStoryIds` is the day's
 * editorial ranking and the pools carry no rank at all, so interleaving would
 * put the shared eight in different positions for different readers, and they
 * would no longer be shared in any sense a reader could check.
 */
import {
  INTEREST_SLUGS,
  INTEREST_STORY_COUNT,
  type Edition,
  type InterestSlug,
  type Story,
} from "@aaj-bas/schemas";
import { coreStories } from "./core-stories";

/** One pooled story, with the three keys that order it. */
type Candidate = {
  readonly story: Story;
  /** 0 for a pool the reader chose, 1 for every other pool. */
  readonly chosen: number;
  /** Index within its own pool, counting only the stories a reader can be shown. */
  readonly position: number;
};

export function editionStories(
  edition: Edition,
  interests: readonly InterestSlug[],
): Story[] {
  const byId = new Map(edition.stories.map((story) => [story.id, story]));
  const core = new Set(edition.coreStoryIds);
  const chosenInterests = new Set(interests);

  const candidates: Candidate[] = [];

  // Walked over `INTEREST_SLUGS` rather than over `Object.keys` of the pools,
  // so that only the pools the published vocabulary names are read at all: a
  // key an edition file carries that is not an interest — `india`, or a slug
  // from a later build — contributes no candidate here, whatever else it may
  // get past.
  //
  // It is deliberately NOT what makes the result independent of how the file
  // was serialised. That comes from the sort key, which carries no walk-order
  // component: `position` counts within one pool, `chosen` and the id are
  // properties of the pool and the story, and the sort is stable over
  // candidates that tie on all three only when they are the same story. Walk
  // these pools in any order and the same two stories come out.
  for (const interest of INTEREST_SLUGS) {
    let position = 0;

    for (const id of edition.interestPools[interest] ?? []) {
      const story = byId.get(id);

      // A validated edition carries every story its pools name and never pools
      // a core story, so this only drops ids the schema already refuses.
      // Dropping is still the right failure: `position` then counts what a
      // reader can actually be shown, so a broken entry costs its own place in
      // the queue rather than leaving a hole in somebody's edition.
      if (story === undefined || core.has(id)) {
        continue;
      }

      candidates.push({
        story,
        chosen: chosenInterests.has(interest) ? 0 : 1,
        position,
      });
      position += 1;
    }
  }

  candidates.sort(
    (a, b) =>
      a.chosen - b.chosen ||
      a.position - b.position ||
      compareIds(a.story.id, b.story.id),
  );

  const pooled: Story[] = [];
  const taken = new Set<string>();

  for (const candidate of candidates) {
    if (pooled.length >= INTEREST_STORY_COUNT) {
      break;
    }
    // A story may sit in more than one pool. Taking it twice would spend two of
    // the reader's places on one story.
    if (taken.has(candidate.story.id)) {
      continue;
    }
    taken.add(candidate.story.id);
    pooled.push(candidate.story);
  }

  /*
    The pooled count is `INTEREST_STORY_COUNT`, never `10 - core.length`.
    Deriving it from the core's shortfall would let a degraded edition that
    published six core stories pull in four pooled ones to reach ten, hiding the
    failure behind a full-looking list. Eight stories, counted honestly, is the
    correct output there. Nothing is padded, repeated, or invented to reach a
    number: fewer available candidates simply means a shorter edition.
  */
  return [...coreStories(edition), ...pooled];
}

/**
 * Equality has to be exact here, unlike the `< ? -1 : 1` comparisons elsewhere
 * in the repository: the same story can appear in two pools, and a comparator
 * that never returns 0 would order those two rows by nothing at all.
 */
function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
