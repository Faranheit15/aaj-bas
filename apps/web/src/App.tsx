/**
 * The reader application.
 *
 * It does three things and no more: read the route, ask for that route's
 * edition, and choose which view describes the answer. Every state the load can
 * be in — loading, ready, empty, failed — has a view here, because a state with
 * no branch is a blank page in production (AGENTS.md section 26).
 */
import type { JSX, ReactNode } from "react";
import { formatEditionDate } from "./edition/editorial-day";
import type { EditionLoadState } from "./edition/use-edition";
import { useEdition } from "./edition/use-edition";
import { EditionUnavailable } from "./reader/EditionUnavailable";
import { EditionView } from "./reader/EditionView";
import { EDITION_HEADING_ID, ReaderShell } from "./reader/ReaderShell";
import type { Route } from "./routing/route";
import { editionHref, LATEST_HREF } from "./routing/route";
import { useRoute } from "./routing/use-route";

export function App(): JSX.Element {
  const route = useRoute();
  const { state, retry } = useEdition(route);

  return (
    <ReaderShell
      routeKey={routeKey(route)}
      statusMessage={statusMessageFor(state)}
    >
      {sampleDataBanner(state)}
      {view(state, route, retry)}
    </ReaderShell>
  );
}

/**
 * A stable identity for the route, used to decide when focus moves.
 *
 * Derived from the route's own href helpers so it cannot disagree with the
 * address bar. Unaddressable paths key on the path itself: collapsing them onto
 * the latest edition's key would make a move between two unknown addresses look
 * like no move at all.
 */
function routeKey(route: Route): string {
  switch (route.kind) {
    case "latest":
      return LATEST_HREF;
    case "edition":
      return editionHref(route.date);
    case "unknown":
      return route.path;
  }
}

function view(
  state: EditionLoadState,
  route: Route,
  retry: () => void,
): ReactNode {
  switch (state.status) {
    case "loading":
      return <h1 id={EDITION_HEADING_ID}>Loading the edition.</h1>;
    case "ready":
      return (
        <EditionView edition={state.edition} freshness={state.freshness} />
      );
    case "none":
      // Not an error. Before the first edition is published there is genuinely
      // nothing to show, and saying so plainly is the honest answer.
      return (
        <>
          <h1 id={EDITION_HEADING_ID}>No edition has been published yet.</h1>
          <p className="edition-message">
            The first edition will appear here when it is published.
          </p>
        </>
      );
    case "failed":
      return (
        <EditionUnavailable
          reason={state.reason}
          route={route}
          priorDate={state.priorDate}
          onRetry={retry}
        />
      );
  }
}

/**
 * Says plainly that the content is invented. Worded for the build rather than
 * for the stories, because the no-edition state shows the banner with no
 * stories under it.
 *
 * Rendered from the content set the build actually staged, not from a
 * development-only flag, so a sample build that reached production would still
 * declare itself. The load states that carry no content set are the ones with
 * no stories under the banner to mislabel.
 */
function sampleDataBanner(state: EditionLoadState): ReactNode {
  const contentSet =
    state.status === "ready" || state.status === "none"
      ? state.contentSet
      : null;
  if (contentSet !== "sample") {
    return null;
  }
  return (
    <p className="sample-banner">
      Development sample data. This build shows invented content, not news.
    </p>
  );
}

/**
 * The short signal announced to assistive technology.
 *
 * Short on purpose: it exists so a reader who cannot see the page knows the
 * load finished, not so the edition can be read twice.
 */
function statusMessageFor(state: EditionLoadState): string {
  switch (state.status) {
    case "loading":
      return "Loading the edition.";
    case "ready":
      return `The edition for ${formatEditionDate(state.edition.date)} is ready.`;
    case "none":
      return "No edition has been published yet.";
    case "failed":
      return "The edition could not be loaded.";
  }
}
