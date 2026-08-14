/**
 * The sources a story rests on, in the order the story cites them.
 *
 * An edition carries one flat `sources` array shared by every story, so the
 * citation order is the story's `sourceIds` and not the order the sources
 * happened to be serialised in. Rendering `edition.sources` filtered by
 * membership would silently reorder a story's provenance list, which section 18
 * makes reader-facing information rather than a detail of the file format.
 */
import type { Edition, SourceReference, Story } from "@aaj-bas/schemas";

export function storySources(
  story: Story,
  edition: Edition,
): SourceReference[] {
  const byId = new Map(edition.sources.map((source) => [source.id, source]));

  const cited: SourceReference[] = [];
  for (const id of story.sourceIds) {
    const source = byId.get(id);
    // A validated edition cannot cite a source it does not carry, so this only
    // skips in the case the schema already refuses to render. Omitting is still
    // the right failure: one fewer link is visible, an undefined in the list is
    // a crash in the middle of the source list.
    if (source !== undefined) {
      cited.push(source);
    }
  }

  return cited;
}
