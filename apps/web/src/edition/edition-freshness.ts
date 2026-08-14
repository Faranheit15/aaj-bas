/**
 * Whether the edition on screen is today's, yesterday's, or one the reader
 * chose from the archive.
 *
 * Section 26 forbids presenting stale content as if it were current, and the
 * distinction is not the same question as "which URL is this?". `/` serving a
 * day-old edition is stale — the pipeline has not published yet, and the reader
 * needs to be told. `/edition/2026-07-14` serving the same file is archived —
 * the reader asked for it, and calling that stale would be alarming noise.
 */
import type { Route } from "../routing/route";

export type EditionFreshness = "current" | "stale" | "archived";

export function editionFreshness(
  routeKind: Route["kind"],
  editionDate: string,
  editorialToday: string,
): EditionFreshness {
  switch (routeKind) {
    case "latest":
      // Both sides are `YYYY-MM-DD`, where lexicographic order is calendar
      // order, so no date arithmetic and no second clock read is needed.
      //
      // An edition dated ahead of today is reported as current, never stale.
      // The realistic cause is a device clock running behind, and blaming the
      // content for the reader's clock would be a false statement about the
      // edition.
      return editionDate < editorialToday ? "stale" : "current";

    case "edition":
      return "archived";

    case "unknown":
      // Unreachable: an unknown route never resolves to an edition. Listed so
      // that adding a route shape fails to compile here rather than silently
      // labelling a new page "current".
      return "archived";

    default: {
      const unreachable: never = routeKind;
      return unreachable;
    }
  }
}
