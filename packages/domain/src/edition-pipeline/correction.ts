/**
 * Domain logic for creating and applying additive edition corrections (AB-704).
 *
 * Enforces:
 * - Version increment (version 1 -> 2, etc.)
 * - Timestamp monotonicity (correctedAt <= updatedAt, correctedAt >= publishedAt)
 * - Additive history (previous correction notes are never removed or mutated)
 * - Story update timestamp synchronization
 */

import {
  type CorrectionNote,
  type Edition,
  type Story,
  correctionNoteSchema,
  editionSchema,
} from "@aaj-bas/schemas";

export interface CreateCorrectionInput {
  edition: Edition;
  storyId: string;
  summary: string;
  detail?: string | undefined;
  updatedStoryFields?:
    | Partial<
        Pick<
          Story,
          | "headline"
          | "deck"
          | "whatChanged"
          | "whyItMatters"
          | "background"
          | "uncertainty"
        >
      >
    | undefined;
  timestamp?: string | undefined;
}

export function applyEditionCorrection(input: CreateCorrectionInput): {
  edition: Edition;
  correctionNote: CorrectionNote;
} {
  const targetStory = input.edition.stories.find((s) => s.id === input.storyId);
  if (!targetStory) {
    throw new Error(
      `Story with ID '${input.storyId}' not found in edition '${input.edition.date}'`,
    );
  }

  const nextVersion = input.edition.editionVersion + 1;
  const nowIso = input.timestamp ?? new Date().toISOString();

  // Generate deterministic unique correction note ID
  const noteId = `corr-${input.storyId}-v${nextVersion}`;

  const rawNote: CorrectionNote = {
    id: noteId,
    storyId: input.storyId,
    correctedAt: nowIso,
    editionVersion: nextVersion,
    summary: input.summary,
    detail: input.detail,
  };

  const validatedNote = correctionNoteSchema.parse(rawNote);

  // Update target story
  const updatedStories = input.edition.stories.map((story) => {
    if (story.id !== input.storyId) {
      return story;
    }
    return {
      ...story,
      ...(input.updatedStoryFields ?? {}),
      updatedAt: nowIso,
    };
  });

  // Calculate updated estimated reading minutes (PRD section 5.1)
  const countStoryVisibleWords = (story: Story): number => {
    const parts = [
      story.deck,
      ...story.whatChanged,
      story.whyItMatters,
      story.uncertainty ?? "",
    ];
    return parts.join(" ").split(/\s+/).filter(Boolean).length;
  };

  const coreStories = updatedStories.filter((s) =>
    input.edition.coreStoryIds.includes(s.id),
  );
  const poolStories = updatedStories.filter(
    (s) => !input.edition.coreStoryIds.includes(s.id),
  );

  const sortedPool = [...poolStories].sort((a, b) => {
    const diff = countStoryVisibleWords(b) - countStoryVisibleWords(a);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  const visibleStoriesList = [...coreStories, ...sortedPool.slice(0, 2)];
  const totalVisibleWords = visibleStoriesList.reduce(
    (total, story) => total + countStoryVisibleWords(story),
    0,
  );
  const estimatedMinutes = Math.max(
    1,
    Math.min(60, Math.ceil(totalVisibleWords / 220)),
  );

  const updatedEdition: Edition = {
    ...input.edition,
    editionVersion: nextVersion,
    status: "corrected",
    updatedAt: nowIso,
    estimatedMinutes,
    stories: updatedStories,
    correctionNotes: [...input.edition.correctionNotes, validatedNote],
  };

  const validatedEdition = editionSchema.parse(updatedEdition);

  return {
    edition: validatedEdition,
    correctionNote: validatedNote,
  };
}
