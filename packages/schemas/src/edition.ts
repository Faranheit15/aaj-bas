/**
 * A day's edition: the product's whole contract with a reader.
 *
 * The file holds eight shared core stories plus a pool of interest candidates.
 * It does not hold "the ten stories" — PRD section 5.2 has a reader see eight
 * core stories plus two chosen locally from the pools, so ten is a property of
 * what a reader is shown, not of what is published. What this schema guarantees
 * is that ten are always *reachable*: eight core, and at least two more across
 * the pools. Which two a reader who has chosen no interests receives is a
 * rendering decision that belongs to AB-204, and is deliberately not decided here.
 *
 * The cross-field rules below are the reason this schema exists at all. Field
 * shapes catch malformed data; referential integrity catches the failure that
 * actually reaches readers — a story citing a source that is not in the file,
 * which renders as a claim with no way to check it. Section 18 makes provenance
 * a product requirement, so a broken source mapping is a blocking error and not
 * a warning.
 *
 * Interest pools are partial. Requiring all six interests to carry two stories
 * each would force at least twenty stories into every edition, which contradicts
 * the ten-story edition AB-102 describes. Only interests with candidates on the
 * day appear.
 */
import { correctionNoteSchema } from "./correction-note";
import { editionDateSchema, timestampSchema } from "./dates";
import { identifierSchema } from "./identifiers";
import { sourceReferenceSchema } from "./source-reference";
import { interestSlugSchema, type InterestSlug } from "./slugs";
import { storySchema } from "./story";
import { z } from "zod";

/** Shared core stories every reader sees, from PRD section 5.2. */
export const CORE_STORY_COUNT = 8;

/**
 * Interest stories a reader picks up, from PRD section 5.2. The pools together
 * must offer at least this many so that CORE_STORY_COUNT + this reaches ten.
 */
export const INTEREST_STORY_COUNT = 2;

/** Lifecycle of a published edition, from PRD section 13.1. */
export const EDITION_STATUSES = ["draft", "published", "corrected"] as const;

export const editionStatusSchema = z.enum(EDITION_STATUSES);
export type EditionStatus = z.infer<typeof editionStatusSchema>;

export const editionSchema = z
  .object({
    /**
     * Bumped only by a contract change, never by a content change. Section 16
     * requires the version to be explicit so a reader built for version 1 can
     * refuse an edition it does not understand instead of half-rendering it.
     */
    schemaVersion: z.literal(1),

    date: editionDateSchema,

    /** 1 on first publication, incremented by each correction. */
    editionVersion: z.int().min(1),

    status: editionStatusSchema,
    publishedAt: timestampSchema,
    updatedAt: timestampSchema,

    estimatedMinutes: z.int().min(1).max(60),

    coreStoryIds: z.array(identifierSchema),
    interestPools: z.partialRecord(
      interestSlugSchema,
      z.array(identifierSchema),
    ),

    stories: z.array(storySchema),
    sources: z.array(sourceReferenceSchema),
    correctionNotes: z.array(correctionNoteSchema),
  })
  .superRefine((edition, ctx) => {
    const storyIds = new Set(edition.stories.map((story) => story.id));
    const sourceIds = new Set(edition.sources.map((source) => source.id));

    duplicatesIn(edition.stories.map((story) => story.id)).forEach((id) => {
      ctx.addIssue({
        code: "custom",
        path: ["stories"],
        message: `duplicate story id ${id}`,
      });
    });
    duplicatesIn(edition.sources.map((source) => source.id)).forEach((id) => {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: `duplicate source id ${id}`,
      });
    });
    duplicatesIn(edition.correctionNotes.map((note) => note.id)).forEach(
      (id) => {
        ctx.addIssue({
          code: "custom",
          path: ["correctionNotes"],
          message: `duplicate correction id ${id}`,
        });
      },
    );

    if (edition.coreStoryIds.length !== CORE_STORY_COUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["coreStoryIds"],
        message: `an edition needs exactly ${CORE_STORY_COUNT} core stories, found ${edition.coreStoryIds.length}`,
      });
    }
    duplicatesIn(edition.coreStoryIds).forEach((id) => {
      ctx.addIssue({
        code: "custom",
        path: ["coreStoryIds"],
        message: `core story ${id} is listed twice`,
      });
    });

    const coreIds = new Set(edition.coreStoryIds);
    coreIds.forEach((id) => {
      if (!storyIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["coreStoryIds"],
          message: `core story ${id} is not in stories`,
        });
      }
    });

    // Pool membership is what makes an interest boost mean "more of this
    // topic". A mismatch here would leave the reader-facing promise and the
    // published data disagreeing, with nothing to reconcile them.
    const storyTopics = new Map(
      edition.stories.map((story) => [story.id, story.topic]),
    );
    const pooledIds = new Set<string>();

    for (const [interest, poolIds] of entriesOf(edition.interestPools)) {
      if (poolIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["interestPools", interest],
          message: `the ${interest} pool is declared but empty`,
        });
      }
      for (const id of poolIds) {
        pooledIds.add(id);
        if (!storyIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["interestPools", interest],
            message: `pooled story ${id} is not in stories`,
          });
          continue;
        }
        if (coreIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["interestPools", interest],
            message: `story ${id} is already a core story`,
          });
        }
        const topic = storyTopics.get(id);
        if (topic !== undefined && topic !== interest) {
          ctx.addIssue({
            code: "custom",
            path: ["interestPools", interest],
            message: `story ${id} has topic ${topic}, so it cannot sit in the ${interest} pool`,
          });
        }
      }
    }

    if (pooledIds.size < INTEREST_STORY_COUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["interestPools"],
        message: `the core and pools together reach ${CORE_STORY_COUNT + pooledIds.size} stories, short of ${CORE_STORY_COUNT + INTEREST_STORY_COUNT}`,
      });
    }

    // An unreachable story is either a selection bug or content nobody can
    // read. Either way it should not ship silently.
    for (const story of edition.stories) {
      if (!coreIds.has(story.id) && !pooledIds.has(story.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["stories"],
          message: `story ${story.id} is in neither the core nor any pool`,
        });
      }

      for (const sourceId of story.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          ctx.addIssue({
            code: "custom",
            path: ["stories"],
            message: `story ${story.id} cites source ${sourceId}, which is not in sources`,
          });
        }
      }

      if (edition.status === "published" && !story.reviewed) {
        ctx.addIssue({
          code: "custom",
          path: ["stories"],
          message: `story ${story.id} is unreviewed, so this edition cannot be published`,
        });
      }
    }

    for (const note of edition.correctionNotes) {
      if (!storyIds.has(note.storyId)) {
        ctx.addIssue({
          code: "custom",
          path: ["correctionNotes"],
          message: `correction ${note.id} refers to story ${note.storyId}, which is not in stories`,
        });
      }
      if (note.editionVersion > edition.editionVersion) {
        ctx.addIssue({
          code: "custom",
          path: ["correctionNotes"],
          message: `correction ${note.id} claims edition version ${note.editionVersion}, ahead of this edition`,
        });
      }
    }

    if (edition.correctionNotes.length > 0) {
      if (edition.status !== "corrected") {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "an edition carrying corrections must have status corrected",
        });
      }
      if (edition.editionVersion < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["editionVersion"],
          message: "a corrected edition must be at least version 2",
        });
      }
    }

    if (Date.parse(edition.updatedAt) < Date.parse(edition.publishedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt must not precede publishedAt",
      });
    }
  });

export type Edition = z.infer<typeof editionSchema>;

/** Every value appearing more than once, each reported once. */
function duplicatesIn(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeated.add(value);
    }
    seen.add(value);
  }
  return [...repeated];
}

/**
 * `Object.entries` over a partial record.
 *
 * Typed narrowly here because `noUncheckedIndexedAccess` makes a bare
 * `Object.entries` hand back `[string, string[] | undefined]`, which would push
 * an undefined check into every caller for a key that cannot be absent.
 */
function entriesOf(
  pools: Partial<Record<InterestSlug, readonly string[]>>,
): [InterestSlug, readonly string[]][] {
  return Object.entries(pools).filter(
    (entry): entry is [InterestSlug, readonly string[]] =>
      entry[1] !== undefined,
  );
}
