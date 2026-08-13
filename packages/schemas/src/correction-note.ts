/**
 * A published correction.
 *
 * Section 46 requires corrections to be timestamped, visible, and additive, and
 * requires that evidence a correction happened is never erased. The shape
 * follows from that: a note names the story it corrects, when it was made, and
 * the edition version it produced, so the archive reads as a sequence rather
 * than as a single mutable document.
 *
 * `summary` is required and reader-visible. An optional summary would allow a
 * correction that records only that something changed, which is the silent
 * factual rewrite section 46 forbids in everything but name.
 */
import { z } from "zod";
import { timestampSchema } from "./dates";
import { boundedText, identifierSchema } from "./identifiers";

export const correctionNoteSchema = z.object({
  id: identifierSchema,

  /** The story whose text was corrected. Checked against the edition. */
  storyId: identifierSchema,

  correctedAt: timestampSchema,

  /**
   * The edition version this correction produced, always above 1: version 1 is
   * the original publication, so a correction that claims to be version 1 is
   * claiming the error was never published.
   */
  editionVersion: z.int().min(2),

  /** What was wrong and what it now says, shown to readers. */
  summary: boundedText(10, 500),

  detail: boundedText(10, 2000).optional(),
});

export type CorrectionNote = z.infer<typeof correctionNoteSchema>;
