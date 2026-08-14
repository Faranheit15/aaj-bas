/**
 * The two URLs the reader has, parsed into a value.
 *
 * `/` is today's edition and `/edition/YYYY-MM-DD` is one deliberately chosen
 * from the archive. There is no third shape and no catch-all that quietly
 * resolves to something else: an address the product does not serve becomes
 * `unknown`, which the reader states plainly rather than redirecting away from.
 *
 * This module is pure and checks SHAPE only. Whether `2026-02-30` is a real
 * calendar day is `editionDateSchema`'s job in `useEdition`, and whether an
 * edition exists for a real day is the archive's — a router that answered
 * either question would need a clock or a network call, and would then be the
 * third place that decides what "today" means.
 */

export type Route =
  | { readonly kind: "latest" }
  | { readonly kind: "edition"; readonly date: string }
  | { readonly kind: "unknown"; readonly path: string };

/** The address of the latest edition. */
export const LATEST_HREF = "/";

const EDITION_PREFIX = "/edition/";

/** Shape only: four digits, two, two. Calendar validity is checked later. */
const EDITION_PATH = /^\/edition\/(\d{4}-\d{2}-\d{2})$/;

export function parseRoute(pathname: string): Route {
  const path = withoutTrailingSlash(pathname);

  if (path === "") {
    return { kind: "latest" };
  }

  const date = EDITION_PATH.exec(path)?.[1];
  if (date !== undefined) {
    return { kind: "edition", date };
  }

  return { kind: "unknown", path };
}

export function editionHref(date: string): string {
  return `${EDITION_PREFIX}${date}`;
}

/**
 * Removes one trailing slash, so `/edition/2026-07-21/` is the same edition as
 * `/edition/2026-07-21`. Exactly one: a path that is only slashes is not an
 * address this product serves, and collapsing it would invent a match.
 */
function withoutTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
