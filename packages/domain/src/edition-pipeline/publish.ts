/**
 * Domain functions for converting and validating published editions (AB-703).
 */

import type { Edition } from "@aaj-bas/schemas";

export function convertDraftToPublished(draft: Edition): Edition {
  const nowIso = new Date().toISOString();
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
