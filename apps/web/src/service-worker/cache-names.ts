/**
 * The names the worker writes under, and the one thing it says about a
 * response it served.
 *
 * Two caches, and the difference between them is the whole of acceptance
 * criterion 2. The shell cache carries the build id, so a deploy replaces it;
 * the content cache does not, so a deploy leaves it alone. Keying editions by
 * build would make every successful deploy delete the editions a reader saved,
 * which would turn a routine deploy into "a failed update deleted the last good
 * edition" -- not through a failure, but through the naming.
 *
 * Both begin with the same prefix, and the cleanup pass will not touch a name
 * that does not: this origin is shared with anything else ever served from it,
 * and a worker that deleted caches it did not create would be deleting somebody
 * else's data.
 *
 * `-v1` on the content cache is the escape hatch for the one change this design
 * cannot absorb. If what is stored under a content URL ever has to change
 * meaning, bumping it abandons every old entry at once; nothing else does.
 *
 * This module imports nothing, deliberately. The worker and the reader both
 * read from it, and the worker's bundle must not acquire Zod or
 * `import.meta.env` by following an import out of here.
 */

/** Every cache this product creates, and nothing else, begins with this. */
export const CACHE_PREFIX = "aaj-bas-";

/** Published content: the pointer, and the editions a reader has opened. */
export const CONTENT_CACHE = `${CACHE_PREFIX}content-v1`;

/**
 * The header the worker adds to a response it served from its cache.
 *
 * The reader has no other way to know. `navigator.onLine` describes a network
 * adapter rather than a document, and the response body is identical either
 * way, so without this the product could not tell a reader that what they are
 * looking at is a saved copy -- and showing a saved copy as though it were
 * current is what section 26 forbids.
 *
 * Defined here rather than in `edition-repository.ts`, which reads it: that
 * module imports Zod and `import.meta.env`, so the worker cannot import from it
 * at all. Two copies of a string that must match, in files never edited
 * together, would fail by reporting every cached edition as freshly fetched.
 */
export const CACHE_SOURCE_HEADER = "x-aaj-bas-cache";

/**
 * The shell cache for one build.
 *
 * The id is a hash of the precache list, so this name changes exactly when the
 * built assets change -- and a deploy that published only an edition reuses the
 * name and the cache with it.
 */
export function shellCacheName(buildId: string): string {
  return `${CACHE_PREFIX}shell-${buildId}`;
}
