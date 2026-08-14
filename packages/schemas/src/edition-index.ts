/**
 * The pointer the reader loads first.
 *
 * PRD section 12.3 pins two public content paths, and this is the one that
 * answers "what should I show?". It deliberately holds dates rather than an
 * edition: a copy of the latest edition would give one document two URLs, two
 * ETags, and a way to disagree with itself, which is the silent failure a
 * pointer cannot have. The cost is one extra round trip on a cold load.
 *
 * It is generated from the editions that were actually staged into a build, so
 * it cannot name an edition that was withheld. Nothing writes it by hand.
 */
import { z } from "zod";
import { editionDateSchema } from "./dates";

/**
 * Which set of editions a build was made from.
 *
 * Present in both modes on purpose. A field that only appears in development
 * lets the two shapes drift and hides the difference exactly where it matters,
 * so the reader can always ask rather than infer, and can say plainly when it
 * is showing invented content.
 */
export const CONTENT_SETS = ["published", "sample"] as const;

export const contentSetSchema = z.enum(CONTENT_SETS);
export type ContentSet = z.infer<typeof contentSetSchema>;

export const editionIndexSchema = z
  .object({
    /** Refused rather than half-read by a reader built for another version. */
    schemaVersion: z.literal(1),

    contentSet: contentSetSchema,

    /**
     * The newest staged edition, or null when nothing was publishable.
     *
     * Null is an ordinary state, not an error: before the first real edition is
     * published there is genuinely nothing to point at, and the reader has to
     * say so rather than invent something.
     */
    latest: editionDateSchema.nullable(),

    /** Every staged edition, newest first. */
    editions: z.array(editionDateSchema),
  })
  .superRefine((index, ctx) => {
    const seen = new Set<string>();
    for (const date of index.editions) {
      if (seen.has(date)) {
        ctx.addIssue({
          code: "custom",
          path: ["editions"],
          message: `edition ${date} is listed twice`,
        });
      }
      seen.add(date);
    }

    // Sorting is part of the contract rather than a convenience: the reader
    // offers "the edition before this one" by position, so an unsorted index
    // would hand a reader a later edition while calling it earlier.
    const descending = [...index.editions].sort().reverse();
    if (index.editions.join() !== descending.join()) {
      ctx.addIssue({
        code: "custom",
        path: ["editions"],
        message: "editions must be listed newest first",
      });
    }

    if (index.latest === null) {
      if (index.editions.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["latest"],
          message: "latest is null but editions were listed",
        });
      }
      return;
    }

    if (index.editions.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["editions"],
        message: `latest is ${index.latest} but no editions were listed`,
      });
      return;
    }

    if (index.editions[0] !== index.latest) {
      ctx.addIssue({
        code: "custom",
        path: ["latest"],
        message: `latest is ${index.latest} but the newest edition listed is ${index.editions[0]}`,
      });
    }
  });

export type EditionIndex = z.infer<typeof editionIndexSchema>;
