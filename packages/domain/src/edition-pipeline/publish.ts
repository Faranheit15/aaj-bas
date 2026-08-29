/**
 * Domain functions for converting and validating published editions (AB-703).
 */

import type { Edition } from "@aaj-bas/schemas";

export interface ConvertDraftOptions {
  readonly timestamp?: string | undefined;
}

export function convertDraftToPublished(
  draft: Edition,
  options?: ConvertDraftOptions,
): Edition {
  if (draft.status !== "draft") {
    throw new Error(
      `Cannot publish edition: expected status to be 'draft', but received '${draft.status}'`,
    );
  }
  if (draft.correctionNotes && draft.correctionNotes.length > 0) {
    throw new Error(
      "Cannot publish edition: draft cannot carry correction notes",
    );
  }
  if (draft.editionVersion !== 1) {
    throw new Error(
      `Cannot publish edition: draft must be editionVersion 1, but received ${draft.editionVersion}`,
    );
  }

  const nowIso = options?.timestamp ?? new Date().toISOString();
  return {
    ...draft,
    status: "published",
    updatedAt: nowIso,
    stories: draft.stories.map((story) => ({
      ...story,
      reviewed: true,
      updatedAt: nowIso,
    })),
  };
}
