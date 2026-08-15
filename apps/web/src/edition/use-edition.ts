/**
 * Loading the edition a route asks for, as a state a component can render.
 *
 * `/` is two requests, not one. `/content/latest.json` is a pointer — a
 * document naming the newest published day — and only then is that day's
 * edition fetched. The extra round trip buys the property that matters: one
 * edition exists at one URL with one ETag, and cannot disagree with a copy of
 * itself.
 *
 * Section 26 wants loading, success, empty, error and stale each handled
 * deliberately, so they are five distinct shapes of one union rather than a
 * bag of booleans that can express "loading and failed" or "ready with no
 * edition". `none` is the empty state and is not an error: an index pointing at
 * nothing means nothing has been published yet, which the reader can say
 * plainly.
 *
 * `editorialToday` is captured once, when a load resolves, and carried in the
 * state. Components stay pure functions of it, freshness never changes under a
 * reader mid-render, and no test needs fake timers.
 *
 * From AB-206 a ready state also carries where the edition came from. That is
 * the acceptance criterion "a failed update does not delete the last good
 * edition" as the reader experiences it: when the network is gone and the
 * service worker answers out of its cache, this resolves READY with
 * `source: "cache"` and one added sentence, not `failed`. `failed` is reached
 * only when there is no copy to show — the request failed and nothing was
 * cached — so an error screen now means an absence of content rather than an
 * absence of signal.
 */
import {
  type ContentSet,
  type Edition,
  type EditionIndex,
  editionDateSchema,
} from "@aaj-bas/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "../routing/route";
import { type EditionFreshness, editionFreshness } from "./edition-freshness";
import {
  type EditionFailureReason,
  editionRepository,
  type EditionSource,
} from "./edition-repository";
import { editorialDay } from "./editorial-day";

export type EditionLoadState =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly edition: Edition;
      readonly freshness: EditionFreshness;
      /** Where the EDITION on screen came from. Never where the index came from. */
      readonly source: EditionSource;
      /** When that copy was downloaded, or null when the response did not say. */
      readonly copyDate: string | null;
      readonly contentSet: ContentSet;
      readonly editorialToday: string;
    }
  | { readonly status: "none"; readonly contentSet: ContentSet }
  | {
      readonly status: "failed";
      readonly reason: EditionFailureReason;
      /** Another edition the reader could be offered instead, if one is known. */
      readonly priorDate: string | null;
    };

export function useEdition(route: Route): {
  readonly state: EditionLoadState;
  readonly retry: () => void;
} {
  const [state, setState] = useState<EditionLoadState>({ status: "loading" });

  // The in-flight request, so that a retry, a route change and an unmount all
  // cancel the same way. React 19's StrictMode runs the effect below twice on
  // mount, which is the same hazard as navigating away mid-flight: a response
  // arriving for a request nobody is waiting for any more.
  const inFlight = useRef<AbortController | null>(null);

  // Depended on as primitives rather than as the route object: `useRoute`
  // derives a fresh Route on every render, so an object dependency would
  // refetch the same edition on every render.
  const kind = route.kind;
  const date = route.kind === "edition" ? route.date : null;

  const request = useCallback(() => {
    inFlight.current?.abort();

    const controller = new AbortController();
    inFlight.current = controller;

    setState({ status: "loading" });

    void loadEdition(kind, date, controller.signal).then((resolved) => {
      if (!controller.signal.aborted) {
        setState(resolved);
      }
    });
  }, [kind, date]);

  useEffect(() => {
    request();

    return () => {
      inFlight.current?.abort();
    };
  }, [request]);

  return { state, retry: request };
}

async function loadEdition(
  kind: Route["kind"],
  date: string | null,
  signal: AbortSignal,
): Promise<EditionLoadState> {
  if (kind === "unknown") {
    return { status: "failed", reason: "unavailable", priorDate: null };
  }

  // A date that is well-shaped but not a real day — `2026-02-30` — is answered
  // without a request. The router checks shape and the calendar is checked
  // here, which is also why no fetch is issued for it: there is no document
  // that could exist, so asking for one would only turn a knowable answer into
  // a network round trip and a 404.
  if (kind === "edition" && !editionDateSchema.safeParse(date).success) {
    return { status: "failed", reason: "unavailable", priorDate: null };
  }

  const index = await editionRepository.getIndex(signal);
  if (!index.ok) {
    return { status: "failed", reason: index.reason, priorDate: null };
  }

  // For a dated route this is the route's date, non-null by the check above.
  const requested = kind === "edition" ? date : index.value.latest;
  if (requested === null) {
    return { status: "none", contentSet: index.value.contentSet };
  }

  // The index is not consulted to decide whether the file exists. It is a
  // pointer that a CDN may serve from cache, so treating it as an authority on
  // existence would invent a failure for an edition published a moment ago.
  const edition = await editionRepository.getByDate(requested, signal);
  if (!edition.ok) {
    return {
      status: "failed",
      reason: edition.reason,
      priorDate: priorDateFrom(index.value, requested),
    };
  }

  const editorialToday = editorialDay(new Date());

  return {
    status: "ready",
    edition: edition.value,
    // The edition's own date, not the requested one: a file served for a date
    // it does not carry is a mismatch the reader should see, not one to hide.
    freshness: editionFreshness(kind, edition.value.date, editorialToday),
    /*
      The EDITION's source, and `index.source` is deliberately unused.

      The notice built from this is a sentence about the document on the
      screen. The two can genuinely differ — a worker may answer a revalidating
      pointer from its cache while the edition itself comes down the wire, and
      the reverse happens the moment a new pointer names a day this device
      already holds. Reading the index's source would then tell a reader their
      freshly fetched edition was saved on this device, or hide that the
      edition they are reading was.
    */
    source: edition.source,
    copyDate: edition.copyDate,
    contentSet: index.value.contentSet,
    editorialToday,
  };
}

/**
 * The newest edition that is not the one just refused.
 *
 * `editions` is newest first by contract, so the first entry that differs is
 * the closest thing the reader can be offered instead.
 */
function priorDateFrom(index: EditionIndex, requested: string): string | null {
  return index.editions.find((candidate) => candidate !== requested) ?? null;
}
