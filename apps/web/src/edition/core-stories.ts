/**
 * The eight stories every reader of an edition sees.
 *
 * An edition file carries more than eight: the core plus the interest pools,
 * from which a reader picks up two (PRD section 5.2). `edition.stories` is
 * therefore the union, and rendering it would hand every reader the whole pool
 * — a longer edition than the product promises, assembled by accident. This
 * function is the guard against that: the core is exactly what `coreStoryIds`
 * names, in the order it names it, because that order is the editorial ranking
 * and not an artefact of how the stories happened to be serialised.
 *
 * Which two pooled stories a reader receives is AB-204's decision and is
 * deliberately not made here.
 */
import type { Edition, Story } from "@aaj-bas/schemas";

export function coreStories(edition: Edition): Story[] {
  const byId = new Map(edition.stories.map((story) => [story.id, story]));

  const core: Story[] = [];
  for (const id of edition.coreStoryIds) {
    const story = byId.get(id);
    // A validated edition cannot name a story it does not carry, so this only
    // skips in the case the schema already refuses to render. Omitting is
    // still the right failure: a hole in the list is visible, an undefined in
    // it is a crash halfway down the page.
    if (story !== undefined) {
      core.push(story);
    }
  }

  return core;
}
