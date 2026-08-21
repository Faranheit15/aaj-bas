/**
 * The rules a source registry must satisfy beyond its schema.
 *
 * `sourceRegistrySchema` answers "is this a well-formed registry"; these rules
 * answer "is this a registry we would fetch from". Nothing here re-checks
 * something the schema already enforces — the protocol allowlist, credentials,
 * ports, fragments, the terms review, and both duplicate keys all live in
 * `registry.ts` — because a duplicated rule would eventually disagree with its
 * twin, and the disagreement would be silent.
 *
 * What is left is everything that needs a judgement the schema cannot make: how
 * a hostname reaches the network, which is a classification rather than a
 * shape, and the cross-entry patterns that show a review was not really done.
 *
 * The host rules read all three URLs an entry carries, not only the one a
 * fetcher will request. See `CLASSIFIED_URL_FIELDS`.
 *
 * Every rule is a pure function of one parsed registry. No filesystem, no
 * network, no clock, no randomness. The clock is the tempting one: a rule that
 * failed a terms review older than a year would be useful, and would also make
 * `bun run check` start failing on a commit nobody touched, purely because time
 * passed. `edition-validation/rules.ts` and ADR-0006 both refuse a clock in
 * this package for that reason, and so does this file. Staleness is a report
 * somebody runs on purpose, not a check that breaks the build in its sleep, and
 * it is deliberately left for a later slice.
 *
 * A rule reports violations only. It does not know its own id or severity;
 * `validate.ts` stamps those from the table below, so a rule cannot misreport
 * which rule it is or quietly downgrade itself.
 */
import { classifyHostname, type HostReach } from "../public-address";
import {
  feedUrlKey,
  permittedUseNoteOf,
  type SourceEntry,
  type SourceRegistry,
} from "./registry";
import type { RegistryFindingSeverity } from "./report";

/** One objection, located but not yet attributed to a rule. */
export interface RuleViolation {
  readonly message: string;
  readonly sourceId?: string;
  readonly path?: string;
}

export interface SourceRegistryRule {
  readonly id: string;
  readonly severity: RegistryFindingSeverity;
  readonly evaluate: (registry: SourceRegistry) => readonly RuleViolation[];
}

export const SOURCE_REGISTRY_RULES: readonly SourceRegistryRule[] = [
  {
    // A feed URL naming an address rather than a host is a source nobody can
    // attribute and, once something fetches it, the first half of the SSRF
    // problem section 19 exists to prevent.
    //
    // The classification comes from `classifyHostname` and never from comparing
    // the URL text. `127.1`, `2130706433`, `0x7f.0.0.1`, `[::ffff:127.0.0.1]`
    // and `[64:ff9b::7f00:1]` all reach the loopback interface, and a rule that
    // matched the string `127.0.0.1` would catch one of them.
    id: "url/no-address-literal",
    severity: "blocking",
    evaluate: (registry) =>
      classifiedHosts(registry).flatMap(
        ({ source, field, url, reach, path }) =>
          reach.kind === "address"
            ? [
                {
                  // The class is in the message because section 37 asks for
                  // failures a reader can act on: "loopback" tells a maintainer
                  // the feed points back at the build machine, where the bare
                  // address may not.
                  message: `source ${source.id} has a ${URL_LABELS[field]} pointing at ${url.hostname}, which is a ${reach.reach} address rather than a named host`,
                  sourceId: source.id,
                  path,
                },
              ]
            : [],
      ),
  },
  {
    // A name that resolves only inside the network running the build is not a
    // publisher, whatever it resolves to on the machine that wrote it down.
    id: "url/no-private-host",
    severity: "blocking",
    evaluate: (registry) =>
      classifiedHosts(registry).flatMap(
        ({ source, field, url, reach, path }) =>
          reach.kind === "private-name"
            ? [
                {
                  message: `source ${source.id} has a ${URL_LABELS[field]} pointing at ${url.hostname}, which resolves only inside a private network`,
                  sourceId: source.id,
                  path,
                },
              ]
            : [],
      ),
  },
  {
    // Half of the mechanism `registry.ts` describes: a fixture entry must point
    // at a name that can never resolve to a real publisher, so a sample cannot
    // quietly become a source of real headlines.
    id: "sample/reserved-host-required",
    severity: "blocking",
    evaluate: (registry) =>
      feedHosts(registry).flatMap(({ source, url, reach, path }) =>
        source.sample && reach.kind !== "reserved-name"
          ? [
              {
                message: `source ${source.id} is marked sample but its feed URL points at ${url.hostname}, which is not a reserved name`,
                sourceId: source.id,
                path,
              },
            ]
          : [],
      ),
  },
  {
    // The other half. A real entry on a reserved name is a fabricated source
    // wearing a real entry's shape, which is exactly what section 18 treats as
    // unpublishable rather than untidy.
    id: "sample/reserved-host-only",
    severity: "blocking",
    evaluate: (registry) =>
      classifiedHosts(registry).flatMap(
        ({ source, field, url, reach, path }) =>
          !source.sample && reach.kind === "reserved-name"
            ? [
                {
                  message: `source ${source.id} has a ${URL_LABELS[field]} pointing at the reserved name ${url.hostname} but is not marked sample`,
                  sourceId: source.id,
                  path,
                },
              ]
            : [],
      ),
  },
  {
    // A registry entirely on reserved names is the fixture the tooling is
    // developed against; a registry entirely on real ones is the production
    // list. A mixture is neither, and blocking it is what forces the pull
    // request that registers the first real publisher to delete the samples in
    // the same diff. That is a mechanism, not a convention: nobody has to
    // remember, and nobody can decide the samples are fine to leave.
    id: "url/mixed-host-classes",
    severity: "blocking",
    evaluate: (registry) => {
      const reserved: string[] = [];
      const real: string[] = [];
      for (const { source, reach } of feedHosts(registry)) {
        (reach.kind === "reserved-name" ? reserved : real).push(source.id);
      }
      if (reserved.length === 0 || real.length === 0) {
        return [];
      }
      // Sorted, like every rule here that lists ids: reordering the `sources`
      // array must not change the bytes of the report.
      return [
        {
          message: `the registry mixes ${reserved.length} reserved-name sources (${[...reserved].sort().join(", ")}) with ${real.length} real ones (${[...real].sort().join(", ")})`,
          path: "sources",
        },
      ];
    },
  },
  {
    // The schema treats two feed URLs as the same only when the URL parser
    // writes them back identically, and stops there on purpose. This is the
    // judgement it declined to make: a pair differing by a trailing slash or a
    // leading `www.` is usually one feed entered twice and occasionally two
    // genuinely different ones, so it goes in front of a human instead of being
    // silently folded or silently blocked.
    id: "duplicate/near-feed-url",
    severity: "warning",
    evaluate: (registry) => {
      const groups = new Map<string, { id: string; href: string }[]>();
      for (const source of registry.sources) {
        const key = foldedFeedUrl(source);
        const members = groups.get(key) ?? [];
        members.push({ id: source.id, href: feedUrlKey(source) });
        groups.set(key, members);
      }

      return sortedEntries(groups).flatMap(([, members]) => {
        const hrefs = [...new Set(members.map((member) => member.href))].sort();
        // Two entries with byte-identical URLs are the schema's duplicate, not
        // this rule's near-duplicate, and reporting both would say one problem
        // twice.
        if (members.length < 2 || hrefs.length < 2) {
          return [];
        }
        const ids = members.map((member) => member.id).sort();
        return [
          {
            message: `sources ${ids.join(", ")} have feed URLs differing only by a trailing slash or a leading www.: ${hrefs.join(", ")}`,
            path: "sources",
          },
        ];
      });
    },
  },
  {
    // The fabrication pattern this file is really watching for: one terms
    // review copied across publishers. Two publishers can permit the same
    // things, and their enumerated `permittedUses` may match freely; what does
    // not happen honestly is two people reading two different terms pages and
    // writing the same sentence about them.
    id: "duplicate/permitted-use-note",
    severity: "warning",
    evaluate: (registry) => {
      const groups = new Map<string, string[]>();
      for (const source of registry.sources) {
        const note = permittedUseNoteOf(source);
        if (note === undefined) {
          continue;
        }
        const shared = groups.get(note) ?? [];
        shared.push(source.id);
        groups.set(note, shared);
      }

      return sortedEntries(groups).flatMap(([, ids]) =>
        ids.length < 2
          ? []
          : [
              {
                message: `sources ${[...ids].sort().join(", ")} record the same permitted-use note verbatim, so one review was written for one source and reused`,
                path: "sources",
              },
            ],
      );
    },
  },
];

/**
 * The three URLs whose host is classified, and why each one is.
 *
 * `feedUrl` is the document something will fetch, so its host is the SSRF
 * surface section 19 names. The other two are read for a different reason, and
 * `termsUrl` is the sharper of them: it records the terms page a human says
 * they read, so a terms page on a loopback, private, or reserved host is close
 * to a proof that nobody outside the build machine could have read it. That is
 * a fabrication tell, which is what section 20 asks this file to be watching
 * for, and the classifier already answers it for free. `siteUrl` is the same
 * argument one step weaker: a publisher whose home page is an address literal
 * is not a publisher a reader could ever verify.
 *
 * Only the host is classified. Unlike `feedUrl`, these two may legitimately be
 * `http:` -- a terms page is a page a human opened, not a document this product
 * fetches and turns into news -- so the feed's https rule deliberately does not
 * reach them.
 */
const CLASSIFIED_URL_FIELDS = ["feedUrl", "siteUrl", "termsUrl"] as const;

type ClassifiedUrlField = (typeof CLASSIFIED_URL_FIELDS)[number];

/** What a finding calls each field, so a message says which URL is wrong. */
const URL_LABELS: Record<ClassifiedUrlField, string> = {
  feedUrl: "feed URL",
  siteUrl: "site URL",
  termsUrl: "terms URL",
};

interface ClassifiedHost {
  readonly index: number;
  readonly source: SourceEntry;
  readonly field: ClassifiedUrlField;
  readonly url: URL;
  readonly reach: HostReach;
  /** `sources[2].termsUrl`, built once here so no rule can spell it its own way. */
  readonly path: string;
}

/**
 * Every classified URL parsed, skipping any the URL parser rejects and any the
 * entry does not carry.
 *
 * The schema rejects an unparseable URL first, and a rule reporting it again
 * would only duplicate it; `registry.test.ts` pins that coupling, because it is
 * the whole reason this `catch` may stay silent. The schema also guarantees
 * `feedUrl` is `https:` by the time a rule runs, which is what keeps its
 * classification meaningful: a `javascript:` URL parses with an empty hostname,
 * and every host rule would pass it without objection. `siteUrl` and `termsUrl`
 * are restricted to http and https by `sourceUrlSchema`, which is the same
 * guarantee for the same reason.
 *
 * A missing `termsUrl` is an absence rather than a violation: an inactive entry
 * may omit it, and a sample entry has no such key at all.
 */
function classifiedHosts(registry: SourceRegistry): ClassifiedHost[] {
  return registry.sources.flatMap((source, index) =>
    CLASSIFIED_URL_FIELDS.flatMap((field) => {
      const value = urlValueOf(source, field);
      if (value === undefined) {
        return [];
      }
      try {
        const url = new URL(value);
        return [
          {
            index,
            source,
            field,
            url,
            reach: classifyHostname(url.hostname),
            path: `sources[${index}].${field}`,
          },
        ];
      } catch {
        return [];
      }
    }),
  );
}

function urlValueOf(
  source: SourceEntry,
  field: ClassifiedUrlField,
): string | undefined {
  switch (field) {
    case "feedUrl":
      return source.feedUrl;
    case "siteUrl":
      return source.siteUrl;
    case "termsUrl":
      return "termsUrl" in source ? source.termsUrl : undefined;
  }
}

/**
 * Feed URLs only, for the two rules that are about the document a fetcher
 * requests rather than about a host appearing anywhere in an entry.
 */
function feedHosts(registry: SourceRegistry): ClassifiedHost[] {
  return classifiedHosts(registry).filter(({ field }) => field === "feedUrl");
}

/**
 * The feed URL with the two differences that are usually typing rather than
 * addressing folded away.
 *
 * This exists only to group near-duplicates for the warning above. It is
 * deliberately not what the schema compares: folding here decides nothing, it
 * only asks a question.
 */
function foldedFeedUrl(source: SourceEntry): string {
  const href = feedUrlKey(source);
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }

  const host = url.hostname.startsWith("www.")
    ? url.hostname.slice("www.".length)
    : url.hostname;
  const path = url.pathname.endsWith("/")
    ? url.pathname.slice(0, -1)
    : url.pathname;

  return `${url.protocol}//${host}${path}${url.search}`;
}

/** Map entries sorted by key, so a rule's output never depends on insertion
 * order. */
function sortedEntries<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
