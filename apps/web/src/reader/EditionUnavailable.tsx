/**
 * What a reader sees when the edition could not be shown.
 *
 * The component decides copy and nothing else: it does not retry, does not
 * consult a clock, and does not know why the load failed beyond the reason it
 * is handed. Section 37 asks failures to be explicit and actionable and section
 * 24 forbids leaking internals, so every message below says what happened in
 * the reader's terms and carries no status code, URL, or stack.
 *
 * At most two actions, in a fixed order: retry, then one way back to an edition
 * that exists. One. A list of past editions would be an archive, which is a
 * continuation surface the product does not have (AGENTS.md section 3.1).
 */
import type { JSX, MouseEvent } from "react";
import type { EditionFailureReason } from "../edition/edition-repository";
import { formatEditionDate } from "../edition/editorial-day";
import type { Route } from "../routing/route";
import { editionHref, LATEST_HREF } from "../routing/route";
import { navigate } from "../routing/use-route";
import { EDITION_HEADING_ID } from "./ReaderShell";

type EditionUnavailableProps = {
  readonly reason: EditionFailureReason;
  readonly route: Route;
  /** The most recent edition known to exist, or null when none is known. */
  readonly priorDate: string | null;
  readonly onRetry: () => void;
};

type Message = {
  readonly heading: string;
  readonly body: string;
};

/** Where a reader can go from here, or null when there is nowhere to offer. */
type PriorEditionLink = {
  readonly href: string;
  readonly label: string;
};

export function EditionUnavailable({
  reason,
  route,
  priorDate,
  onRetry,
}: EditionUnavailableProps): JSX.Element {
  const message = messageFor(reason, route);
  const priorEdition = priorEditionLinkFor(route, priorDate);

  // Retrying re-requests the same bytes. That can fix a dropped connection, a
  // failing host, or an edition that has since been published; it cannot fix an
  // edition whose content does not parse or does not validate, so those two
  // reasons get no button rather than a button that is guaranteed to fail.
  const canRetry =
    reason === "network" ||
    reason === "unavailable" ||
    reason === "unreachable";

  return (
    <>
      <h1 id={EDITION_HEADING_ID}>{message.heading}</h1>
      <p className="edition-message">{message.body}</p>

      {canRetry || priorEdition !== null ? (
        <p className="edition-actions">
          {canRetry ? (
            <button className="edition-action" type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
          {priorEdition === null ? null : (
            <a
              className="edition-action"
              href={priorEdition.href}
              onClick={(event) => followInApp(event, priorEdition.href)}
            >
              {priorEdition.label}
            </a>
          )}
        </p>
      ) : null}
    </>
  );
}

function messageFor(reason: EditionFailureReason, route: Route): Message {
  switch (reason) {
    case "network":
      // Read only here, after a request has already failed. Asking before a
      // fetch would refuse a load that would have succeeded: `onLine` false is
      // reliable, `onLine` true means nothing.
      return navigator.onLine
        ? {
            heading: "We could not reach the edition.",
            body: "The edition could not be downloaded. Your connection may have dropped.",
          }
        : {
            heading: "You appear to be offline.",
            body: "The edition could not be downloaded. It has not been saved to this device.",
          };
    case "unavailable":
      // An unaddressable path is not "no edition for that date": the reader
      // asked for nothing in particular, so they are told what this address
      // holds rather than being told about a date they never named.
      return route.kind === "edition"
        ? {
            heading: "There is no edition for that date.",
            body: "No edition is published for that date.",
          }
        : {
            heading: "The edition is not available.",
            body: "Nothing is published at this address yet.",
          };
    case "unreachable":
      // Not "nothing is published": the host refused to answer, which is no
      // evidence either way about the edition. Saying whose problem it is keeps
      // the reader from checking a connection that is working, and retrying can
      // genuinely succeed, so this is a failure worth naming separately.
      return {
        heading: "The edition could not be loaded.",
        body: "The service did not return the edition. This is a problem at our end, not with the address.",
      };
    case "malformed":
    case "invalid":
      // Deliberately one message for two reasons. The difference between
      // unparseable and invalid is an operational distinction, and the reader
      // can act on neither.
      return {
        heading: "We could not display this edition.",
        body: "This edition did not match the format the reader expects, so it has not been shown rather than shown incorrectly.",
      };
  }
}

function priorEditionLinkFor(
  route: Route,
  priorDate: string | null,
): PriorEditionLink | null {
  switch (route.kind) {
    case "latest":
      // The reader is already at the latest edition's address, so the only
      // thing worth offering is an edition known to exist.
      return priorDate === null
        ? null
        : {
            href: editionHref(priorDate),
            label: `Open the edition from ${formatEditionDate(priorDate)}`,
          };
    case "edition":
    case "unknown":
      // Both asked for a specific address that gave nothing back. Without this
      // the reader is at a dead end with no way into the product, which is the
      // one thing an error state must not do.
      return { href: LATEST_HREF, label: "Open the latest edition" };
  }
}

/**
 * Keep an in-app route in the app, and leave every other click alone.
 *
 * The `href` is real so the link can be opened in a new tab, copied, or used
 * without JavaScript; only a plain left click is taken over.
 */
function followInApp(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  navigate(href);
}
