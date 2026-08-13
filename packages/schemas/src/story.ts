/**
 * One story in an edition.
 *
 * A story is a cluster of reporting rendered as the product's own words with a
 * link back to every source it rests on. It carries no article body: section 18
 * permits metadata, permitted descriptions, and generated summaries, and nothing
 * here is a place to paste a publisher's paragraphs.
 *
 * Two invariants are enforced here rather than at the edition level because they
 * are internal to a story and should fail with the story in hand: the declared
 * source count must match the sources actually listed, and the confidence label
 * must match how many sources support the claim. A story labelled multi-source
 * with one source is the kind of quiet overstatement section 22 rules out.
 *
 * Text bounds below are safety limits on untrusted generated input, not
 * editorial length rules. AB-103 owns editorial length.
 */
import { z } from "zod";
import { timestampSchema } from "./dates";
import { boundedText, identifierSchema } from "./identifiers";
import { topicSlugSchema } from "./slugs";

/** Allowed reporting labels, from PRD section 6.3. */
export const REPORTING_TYPES = [
  "reporting",
  "analysis",
  "opinion",
  "official",
  "research",
] as const;

export const reportingTypeSchema = z.enum(REPORTING_TYPES);
export type ReportingType = z.infer<typeof reportingTypeSchema>;

/** How well supported the story is, from PRD section 13.2. */
export const CONFIDENCE_LEVELS = [
  "single-source",
  "multi-source",
  "disputed",
] as const;

export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof confidenceSchema>;

export const storySchema = z
  .object({
    id: identifierSchema,
    slug: identifierSchema,
    topic: topicSlugSchema,
    reportingType: reportingTypeSchema,

    headline: boundedText(10, 160),

    /** The one-line "what changed" shown on the collapsed card. */
    deck: boundedText(10, 240),

    /**
     * PRD section 6.2 asks for two short factual paragraphs. One is allowed
     * because a genuinely small change should not be padded to fill a layout,
     * which section 20 forbids outright.
     */
    whatChanged: z.array(boundedText(20, 800)).min(1).max(4),

    whyItMatters: boundedText(20, 800),

    background: boundedText(20, 1500).optional(),

    /** Shown when sources disagree or the facts are still incomplete. */
    uncertainty: boundedText(20, 800).optional(),

    sourceIds: z.array(identifierSchema).min(1).max(20),
    sourceCount: z.int().min(1),
    confidence: confidenceSchema,

    firstPublishedAt: timestampSchema,
    updatedAt: timestampSchema,

    /** Which model produced the summary, absent when a human wrote it. */
    generatedBy: boundedText(1, 120).optional(),
    promptVersion: boundedText(1, 60).optional(),

    reviewed: z.boolean(),
  })
  .superRefine((story, ctx) => {
    const uniqueSourceIds = new Set(story.sourceIds);
    if (uniqueSourceIds.size !== story.sourceIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceIds"],
        message: "sourceIds must not repeat a source",
      });
    }

    if (story.sourceCount !== story.sourceIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceCount"],
        message: `sourceCount is ${story.sourceCount} but ${story.sourceIds.length} sources are listed`,
      });
    }

    const isSingle = story.confidence === "single-source";
    if (isSingle && uniqueSourceIds.size !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "single-source stories must list exactly one source",
      });
    }
    if (!isSingle && uniqueSourceIds.size < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["confidence"],
        message: `${story.confidence} stories must list at least two sources`,
      });
    }

    // Compared as instants, not as strings: 2026-08-13T10:00:00+05:30 and
    // 2026-08-13T06:00:00Z are the same moment but sort in the wrong order.
    if (Date.parse(story.updatedAt) < Date.parse(story.firstPublishedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt must not precede firstPublishedAt",
      });
    }
  });

export type Story = z.infer<typeof storySchema>;
