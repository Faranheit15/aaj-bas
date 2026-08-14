/**
 * The editorial rules an edition must satisfy beyond its schema.
 *
 * `editionSchema` answers "is this a well-formed edition"; these rules answer
 * "is this an edition we would publish". The split matters because the schema is
 * a contract shared with every reader of the content, while these are editorial
 * judgements that change when the PRD changes. Nothing here re-checks something
 * the schema already enforces: a duplicated rule would eventually disagree with
 * its twin, and the disagreement would be silent.
 *
 * Every rule is a pure function of one parsed `Edition`. No filesystem, no
 * network, no clock, no randomness — section 10 keeps this package pure, and
 * section 22 requires editorial logic to be deterministic and inspectable, which
 * a rule that consults the current time is not. Reading the source of a rule
 * should be enough to predict exactly when it fires.
 *
 * A rule reports violations only. It does not know its own id or severity;
 * `validate.ts` stamps those from the table below, so a rule cannot misreport
 * which rule it is or quietly downgrade itself.
 */
import type { Edition, SourceReference, Story } from "@aaj-bas/schemas";
import { HARD_NEWS_TERMS } from "./hard-news-terms";
import type { FindingSeverity } from "./report";

/** One objection, located but not yet attributed to a rule. */
export interface RuleViolation {
  readonly message: string;
  readonly storyId?: string;
  readonly path?: string;
}

export interface EditionRule {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly evaluate: (edition: Edition) => readonly RuleViolation[];
}

/** PRD section 5.1: estimated duration is visible words at 220 words a minute. */
const WORDS_PER_MINUTE = 220;

/** PRD section 5.4 diversity floors and caps. */
const MIN_DISTINCT_PUBLISHERS = 6;
const MAX_CORE_STORIES_PER_PRIMARY_PUBLISHER = 2;
const MAX_CORE_STORIES_PER_PUBLISHER = 2;
const MAX_CORE_STORIES_PER_TOPIC = 3;

/** Thresholds for the duplication heuristics. See each rule for why. */
const SHARED_SOURCE_MAJORITY = 0.5;
const SHARED_SOURCE_MIN = 2;
const HEADLINE_DICE_THRESHOLD = 0.4;
const SLUG_JACCARD_THRESHOLD = 0.5;
const SLUG_MIN_SHARED_TOKENS = 2;

/** Editorial length guidance from PRD sections 6.1 and 6.2, as word counts. */
const MAX_DECK_WORDS = 30;
const MAX_WHAT_CHANGED_WORDS = 90;
const MAX_WHY_IT_MATTERS_WORDS = 80;

/**
 * Words carried by the similarity heuristics without saying anything about the
 * subject. Kept short and checked in rather than pulled from a library: a
 * stopword list that nobody can read is an editorial decision nobody can review.
 */
const SIMILARITY_STOPWORDS: ReadonlySet<string> = new Set([
  "about",
  "after",
  "against",
  "also",
  "and",
  "are",
  "been",
  "before",
  "but",
  "for",
  "from",
  "has",
  "have",
  "her",
  "his",
  "into",
  "its",
  "more",
  "most",
  "not",
  "over",
  "said",
  "says",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "under",
  "was",
  "were",
  "what",
  "when",
  "which",
  "while",
  "who",
  "will",
  "with",
  "would",
]);

/**
 * Markup that must never reach a rendered story.
 *
 * Section 18 forbids rendering source HTML and section 24 forbids raw HTML
 * generally. The question each pattern asks is not "is this valid HTML" but
 * "did markup survive normalisation", and each requires enough structure that
 * ordinary prose cannot supply it by accident. This rule blocks, and `report.ts`
 * is explicit that a blocking rule which fires on something an editor may
 * legitimately have written is worse than no rule at all:
 *
 * - a tag needs its closing angle bracket, so `the ratio a<b held` is prose and
 *   `<b>`, `</p>`, and `<script>` are markup;
 * - an entity needs at least two name characters, so `AT&T; analysts` is prose
 *   and `&lt;`, `&amp;`, and `&nbsp;` are markup;
 * - a numeric reference is matched in both the decimal and the hexadecimal form
 *   an HTML encoder may emit, since `&#x3C;` and `&#60;` render identically;
 * - a comment or doctype opener is matched on `<!` alone, with no closing
 *   bracket required. It is deliberately the loosest of the four: a truncated
 *   `<!--` is still markup residue, and no prose writes `<!` followed by a
 *   letter or a dash.
 */
const MARKUP_PATTERNS: readonly RegExp[] = [
  /<\/?[a-zA-Z][^<>]*>/,
  /<!(?:--|[a-zA-Z])/,
  /&[a-zA-Z][a-zA-Z0-9]{1,31};/,
  /&#(?:\d+|[xX][0-9a-fA-F]+);/,
];

/** Hosts a real edition may not use, from RFC 2606 and RFC 6761. */
const RESERVED_TLDS: readonly string[] = ["invalid", "test", "example"];
const RESERVED_DOMAINS: readonly string[] = [
  "example.com",
  "example.net",
  "example.org",
];

/** Hostnames that resolve inside the network running the build. */
const PRIVATE_HOST_SUFFIXES: readonly string[] = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
];

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export const EDITION_RULES: readonly EditionRule[] = [
  {
    // The schema enforces unique story ids and says nothing about slugs, but the
    // slug is what will appear in a URL, so a collision is a story a reader
    // cannot reach rather than merely untidy data.
    id: "structural/duplicate-slug",
    severity: "blocking",
    evaluate: (edition) => {
      const violations: RuleViolation[] = [];
      const seen = new Map<string, string>();
      edition.stories.forEach((story, index) => {
        const first = seen.get(story.slug);
        if (first === undefined) {
          seen.set(story.slug, story.id);
          return;
        }
        violations.push({
          message: `story ${story.id} reuses the slug ${story.slug}, already used by ${first}`,
          storyId: story.id,
          path: `stories[${index}].slug`,
        });
      });
      return violations;
    },
  },
  {
    // The schema blocks an unreviewed story only in a `published` edition. A
    // `corrected` edition is a published edition that has been corrected, so the
    // human review gate in section 44 applies to it just as much.
    id: "structural/unreviewed-story-gate",
    severity: "blocking",
    evaluate: (edition) => {
      if (edition.status !== "published" && edition.status !== "corrected") {
        return [];
      }
      return edition.stories.flatMap((story, index) =>
        story.reviewed
          ? []
          : [
              {
                message: `story ${story.id} is unreviewed, so an edition with status ${edition.status} cannot carry it`,
                storyId: story.id,
                path: `stories[${index}].reviewed`,
              },
            ],
      );
    },
  },
  {
    // A cited source published after the story last changed cannot be what the
    // story rests on. The comparand is `updatedAt` and not `firstPublishedAt`
    // because a source that postdates first publication is the ordinary case: it
    // is often the thing that triggered the update.
    id: "structural/source-not-after-story-update",
    severity: "blocking",
    evaluate: (edition) => {
      const sources = sourcesById(edition);
      const violations: RuleViolation[] = [];
      edition.stories.forEach((story, index) => {
        const storyUpdated = Date.parse(story.updatedAt);
        for (const sourceId of story.sourceIds) {
          const source = sources.get(sourceId);
          if (source === undefined) {
            continue;
          }
          if (Date.parse(source.publishedAt) > storyUpdated) {
            violations.push({
              message: `source ${sourceId} was published at ${source.publishedAt}, after story ${story.id} was last updated at ${story.updatedAt}`,
              storyId: story.id,
              path: `stories[${index}].sourceIds`,
            });
          }
        }
      });
      return violations;
    },
  },
  {
    // Section 20 makes generated text traceable to what produced it. Half a
    // provenance pair records that a model was involved without recording which
    // instructions it followed, which cannot be audited or reproduced.
    id: "structural/generated-provenance-pair",
    severity: "blocking",
    evaluate: (edition) =>
      edition.stories.flatMap((story, index) => {
        const hasModel = story.generatedBy !== undefined;
        const hasPrompt = story.promptVersion !== undefined;
        if (hasModel === hasPrompt) {
          return [];
        }
        return [
          {
            message: hasModel
              ? `story ${story.id} names generatedBy but no promptVersion`
              : `story ${story.id} names promptVersion but no generatedBy`,
            storyId: story.id,
            path: `stories[${index}]`,
          },
        ];
      }),
  },
  {
    // Everything a reader can see, not only the story body. PRD 6.2 renders the
    // publisher name beside each link, and section 46 requires a correction to
    // be visible, so both are rendered text and both can carry markup in from
    // whatever produced them.
    id: "structural/no-markup-in-text",
    severity: "blocking",
    evaluate: (edition) => {
      const violations: RuleViolation[] = [];
      edition.stories.forEach((story, index) => {
        for (const [field, text] of readerVisibleFields(story)) {
          if (containsMarkup(text)) {
            violations.push({
              message: `story ${story.id} has markup in ${field}, which must never be rendered`,
              storyId: story.id,
              path: `stories[${index}].${field}`,
            });
          }
        }
      });
      edition.sources.forEach((source, index) => {
        for (const field of ["title", "publisher"] as const) {
          if (containsMarkup(source[field])) {
            violations.push({
              message: `source ${source.id} has markup in its ${field}, which must never be rendered`,
              path: `sources[${index}].${field}`,
            });
          }
        }
      });
      edition.correctionNotes.forEach((note, index) => {
        const fields: [string, string][] = [["summary", note.summary]];
        if (note.detail !== undefined) {
          fields.push(["detail", note.detail]);
        }
        for (const [field, text] of fields) {
          if (containsMarkup(text)) {
            violations.push({
              message: `correction ${note.id} has markup in its ${field}, which must never be rendered`,
              storyId: note.storyId,
              path: `correctionNotes[${index}].${field}`,
            });
          }
        }
      });
      return violations;
    },
  },
  {
    // Section 22: when sources disagree the product preserves the disagreement.
    // A story labelled disputed with nothing in `uncertainty` has told the
    // reader there is a dispute and then withheld what it is.
    id: "structural/disputed-requires-uncertainty",
    severity: "blocking",
    evaluate: (edition) =>
      edition.stories.flatMap((story, index) =>
        story.confidence === "disputed" && story.uncertainty === undefined
          ? [
              {
                message: `story ${story.id} is disputed but says nothing about what is uncertain`,
                storyId: story.id,
                path: `stories[${index}].uncertainty`,
              },
            ]
          : [],
      ),
  },
  {
    // Section 22: an official statement must not be presented as independently
    // verified reporting. When every source is official there is no independent
    // reporting in the story at all, so any other label overstates it.
    id: "structural/official-source-only-needs-official-label",
    severity: "blocking",
    evaluate: (edition) => {
      const sources = sourcesById(edition);
      return edition.stories.flatMap((story, index) => {
        const cited = resolveSources(story, sources);
        if (cited.length === 0 || story.reportingType === "official") {
          return [];
        }
        if (!cited.every((source) => source.sourceType === "official")) {
          return [];
        }
        return [
          {
            message: `story ${story.id} cites only official sources but is labelled ${story.reportingType}`,
            storyId: story.id,
            path: `stories[${index}].reportingType`,
          },
        ];
      });
    },
  },

  {
    // PRD 5.4: at least six distinct source organizations across the edition.
    // Counted over sources a story actually cites, because an uncited source is
    // a publisher no reader sees and cannot make the edition more diverse.
    id: "diversity/min-publishers",
    severity: "blocking",
    evaluate: (edition) => {
      const publishers = new Set(
        citedSources(edition).map((source) => source.publisher),
      );
      if (publishers.size >= MIN_DISTINCT_PUBLISHERS) {
        return [];
      }
      return [
        {
          message: `the edition cites ${publishers.size} distinct publishers, short of ${MIN_DISTINCT_PUBLISHERS}`,
          path: "sources",
        },
      ];
    },
  },
  {
    // PRD 5.4: no more than two core stories primarily supported by the same
    // publisher. "Primarily supported" is read as the publisher of the first
    // cited source, the one the story leads on.
    //
    // The alternative reading — any appearance in any core story — cannot be
    // what the clause means. A cap of two under that reading would need at least
    // four publishers for eight single-source stories and nine for eight
    // three-source stories with no overlap, and the same PRD clause sets the
    // floor at six publishers, not nine. The any-appearance concern is real but
    // weaker, so it is carried by `diversity/publisher-concentration` as a
    // warning rather than by this rule.
    id: "diversity/publisher-primary-cap",
    severity: "blocking",
    evaluate: (edition) => {
      const sources = sourcesById(edition);
      const counts = new Map<string, string[]>();
      for (const story of coreStories(edition)) {
        const leadSourceId = story.sourceIds[0];
        if (leadSourceId === undefined) {
          continue;
        }
        const publisher = sources.get(leadSourceId)?.publisher;
        if (publisher === undefined) {
          continue;
        }
        const carried = counts.get(publisher) ?? [];
        carried.push(story.id);
        counts.set(publisher, carried);
      }
      return sortedEntries(counts).flatMap(([publisher, storyIds]) =>
        storyIds.length > MAX_CORE_STORIES_PER_PRIMARY_PUBLISHER
          ? [
              {
                message: `${publisher} primarily supports ${storyIds.length} core stories (${storyIds.join(", ")}), above the cap of ${MAX_CORE_STORIES_PER_PRIMARY_PUBLISHER}`,
                path: "coreStoryIds",
              },
            ]
          : [],
      );
    },
  },
  {
    // The any-appearance reading of the same PRD clause. A publisher supporting
    // most of the core is a concentration worth an editor's attention, but it is
    // a judgement about how the day's reporting happened to fall rather than a
    // defect in the file, so it warns.
    id: "diversity/publisher-concentration",
    severity: "warning",
    evaluate: (edition) => {
      const sources = sourcesById(edition);
      const counts = new Map<string, Set<string>>();
      for (const story of coreStories(edition)) {
        for (const source of resolveSources(story, sources)) {
          const carried = counts.get(source.publisher) ?? new Set<string>();
          carried.add(story.id);
          counts.set(source.publisher, carried);
        }
      }
      return sortedEntries(counts).flatMap(([publisher, storyIds]) =>
        storyIds.size > MAX_CORE_STORIES_PER_PUBLISHER
          ? [
              {
                message: `${publisher} appears in ${storyIds.size} core stories (${[...storyIds].sort().join(", ")})`,
                path: "coreStoryIds",
              },
            ]
          : [],
      );
    },
  },
  {
    // PRD 5.4: no more than three core stories in one topic "unless explicitly
    // overridden". No override mechanism exists, and inventing one before a real
    // edition needs it would be the speculative infrastructure section 48 rules
    // out. It lands, in the edition contract, the day an editor has a day whose
    // news genuinely does not fit.
    id: "diversity/topic-cap",
    severity: "blocking",
    evaluate: (edition) => {
      const counts = new Map<string, string[]>();
      for (const story of coreStories(edition)) {
        const carried = counts.get(story.topic) ?? [];
        carried.push(story.id);
        counts.set(story.topic, carried);
      }
      return sortedEntries(counts).flatMap(([topic, storyIds]) =>
        storyIds.length > MAX_CORE_STORIES_PER_TOPIC
          ? [
              {
                message: `${storyIds.length} core stories carry the topic ${topic} (${storyIds.join(", ")}), above the cap of ${MAX_CORE_STORIES_PER_TOPIC}`,
                path: "coreStoryIds",
              },
            ]
          : [],
      );
    },
  },
  {
    // PRD 5.4: no edition composed *entirely* of conflict, crime, disaster, or
    // political confrontation.
    //
    // "Entirely" is what makes a keyword list safe enough to block on. A keyword
    // match is a guess about what a story is about, and this rule needs every
    // one of the eight core stories to match before it fires, so a single false
    // positive changes nothing. A list this blunt could not be trusted to
    // classify one story on its own.
    id: "diversity/all-hard-news",
    severity: "blocking",
    evaluate: (edition) => {
      const core = coreStories(edition);
      if (core.length === 0) {
        return [];
      }
      if (!core.every((story) => matchesHardNews(story))) {
        return [];
      }
      return [
        {
          message:
            "every core story reads as conflict, crime, disaster, or political confrontation, so the edition offers a reader nothing else",
          path: "coreStoryIds",
        },
      ];
    },
  },

  {
    // PRD 5.4: no duplicate real-world event presented as separate stories.
    // Two stories resting on mostly the same evidence are, as far as the file
    // can show, the same event told twice. This is a fact about the citations
    // rather than a guess about the text, which is why it blocks.
    //
    // Two shared sources are required as well as the ratio. On the ratio alone,
    // one document cited by a two-source story and a five-source story scores
    // 0.5 and blocks the edition — and a budget document legitimately supporting
    // both a tax story and a defence story is exactly that shape. One shared
    // source is not evidence of one event, so it stays with the warning below.
    id: "duplicate/shared-source-majority",
    severity: "blocking",
    evaluate: (edition) =>
      storyPairs(edition).flatMap(({ first, second, secondIndex }) => {
        const shared = sharedSourceIds(first, second);
        const smaller = Math.min(
          first.sourceIds.length,
          second.sourceIds.length,
        );
        if (
          smaller === 0 ||
          shared.length < SHARED_SOURCE_MIN ||
          shared.length / smaller < SHARED_SOURCE_MAJORITY
        ) {
          return [];
        }
        return [
          {
            message: `stories ${first.id} and ${second.id} share ${shared.length} of ${smaller} sources (${shared.join(", ")}), so they may be one event told twice`,
            storyId: second.id,
            path: `stories[${secondIndex}].sourceIds`,
          },
        ];
      }),
  },
  {
    // A shared source is ordinary: a newswire report can legitimately support
    // two different stories on the same day. Worth surfacing, not worth
    // blocking.
    //
    // It reports every shared source, including one the blocking rule above
    // already objected to. The two answer different questions — which source is
    // doing double duty, and which pair of stories may be one event — and are
    // located differently, at `sources` rather than at a story's citations.
    // Going quiet when the other rule fires would make this list incomplete
    // exactly when an editor is reading it most carefully, and would make what
    // this rule reports depend on another rule's threshold, which is the kind of
    // hidden coupling section 22 asks editorial logic not to have.
    id: "duplicate/shared-source",
    severity: "warning",
    evaluate: (edition) => {
      const citingStories = new Map<string, string[]>();
      for (const story of edition.stories) {
        for (const sourceId of story.sourceIds) {
          const carried = citingStories.get(sourceId) ?? [];
          carried.push(story.id);
          citingStories.set(sourceId, carried);
        }
      }
      return sortedEntries(citingStories).flatMap(([sourceId, storyIds]) =>
        storyIds.length > 1
          ? [
              {
                message: `source ${sourceId} is cited by ${storyIds.length} stories (${storyIds.join(", ")})`,
                path: "sources",
              },
            ]
          : [],
      );
    },
  },
  {
    // Lexical similarity is a guess about the world: two stories can describe
    // genuinely different events in nearly the same words, and a rule that
    // blocked on this would eventually block a correct edition and teach editors
    // to route around the validator. Shared evidence is a fact about the file;
    // this is not, so it never blocks.
    id: "duplicate/headline-similarity",
    severity: "warning",
    evaluate: (edition) =>
      storyPairs(edition).flatMap(({ first, second, secondIndex }) => {
        const score = diceCoefficient(
          significantTokens(`${first.headline} ${first.deck}`),
          significantTokens(`${second.headline} ${second.deck}`),
        );
        if (score < HEADLINE_DICE_THRESHOLD) {
          return [];
        }
        return [
          {
            message: `stories ${first.id} and ${second.id} have ${score.toFixed(2)} word overlap in their headline and deck`,
            storyId: second.id,
            path: `stories[${secondIndex}].headline`,
          },
        ];
      }),
  },
  {
    // Slugs are editor-written and shorter than headlines, so they overlap for a
    // different reason: two slugs about the same event tend to reuse the same
    // proper nouns. Two shared tokens are required so that a pair of two-token
    // slugs sharing one generic word does not reach the threshold on its own.
    id: "duplicate/slug-similarity",
    severity: "warning",
    evaluate: (edition) =>
      storyPairs(edition).flatMap(({ first, second, secondIndex }) => {
        const firstTokens = new Set(first.slug.split("-"));
        const secondTokens = new Set(second.slug.split("-"));
        const shared = [...firstTokens].filter((token) =>
          secondTokens.has(token),
        );
        const union = new Set([...firstTokens, ...secondTokens]);
        const jaccard = union.size === 0 ? 0 : shared.length / union.size;
        if (
          shared.length < SLUG_MIN_SHARED_TOKENS ||
          jaccard < SLUG_JACCARD_THRESHOLD
        ) {
          return [];
        }
        return [
          {
            message: `slugs ${first.slug} and ${second.slug} share ${shared.length} of ${union.size} words (${shared.join(", ")})`,
            storyId: second.id,
            path: `stories[${secondIndex}].slug`,
          },
        ];
      }),
  },

  {
    // PRD 5.1: estimated duration is the visible summary word count at 220 words
    // a minute, rounded up. The declared number is what a reader is promised on
    // the way in, so it is checked for exact equality rather than a tolerance —
    // a tolerance would be a second, quieter definition of the same promise.
    //
    // Visible means: `deck`, every `whatChanged` paragraph, `whyItMatters`, and
    // `uncertainty` where present, over the eight core stories plus the two
    // longest pooled stories, ties broken by story id ascending so the answer
    // does not depend on key order. `headline` is excluded because it is a label
    // rather than summary prose, and `background` because PRD 6.2 collapses it
    // by default — it is not visible without a further action by the reader.
    //
    // Ten stories, not all of them: PRD 5.2 has a reader see eight core plus two
    // from the pools, so the pools in full would overstate every edition.
    id: "length/estimated-minutes",
    severity: "blocking",
    evaluate: (edition) => {
      const words = visibleStories(edition).reduce(
        (total, story) => total + visibleWordCount(story),
        0,
      );
      const expected = Math.ceil(words / WORDS_PER_MINUTE);
      if (expected === edition.estimatedMinutes) {
        return [];
      }
      return [
        {
          message: `estimatedMinutes is ${edition.estimatedMinutes} but ${words} visible words at ${WORDS_PER_MINUTE} a minute is ${expected}`,
          path: "estimatedMinutes",
        },
      ];
    },
  },
  {
    // PRD 6.1 calls the deck a one-line "what changed". Over thirty words it is
    // no longer one line on a phone and has started to be the summary.
    id: "length/deck-one-line",
    severity: "warning",
    evaluate: (edition) =>
      edition.stories.flatMap((story, index) => {
        const words = wordCount(story.deck);
        return words > MAX_DECK_WORDS
          ? [
              {
                message: `the deck of story ${story.id} runs to ${words} words, above the one-line guide of ${MAX_DECK_WORDS}`,
                storyId: story.id,
                path: `stories[${index}].deck`,
              },
            ]
          : [];
      }),
  },
  {
    // PRD 6.2 asks for short factual paragraphs.
    id: "length/what-changed-paragraph-words",
    severity: "warning",
    evaluate: (edition) =>
      edition.stories.flatMap((story, index) =>
        story.whatChanged.flatMap((paragraph, paragraphIndex) => {
          const words = wordCount(paragraph);
          return words > MAX_WHAT_CHANGED_WORDS
            ? [
                {
                  message: `whatChanged paragraph ${paragraphIndex + 1} of story ${story.id} runs to ${words} words, above the short-paragraph guide of ${MAX_WHAT_CHANGED_WORDS}`,
                  storyId: story.id,
                  path: `stories[${index}].whatChanged[${paragraphIndex}]`,
                },
              ]
            : [];
        }),
      ),
  },
  {
    // PRD 6.2 asks for one concise paragraph.
    id: "length/why-it-matters-one-paragraph",
    severity: "warning",
    evaluate: (edition) =>
      edition.stories.flatMap((story, index) => {
        const words = wordCount(story.whyItMatters);
        return words > MAX_WHY_IT_MATTERS_WORDS
          ? [
              {
                message: `whyItMatters of story ${story.id} runs to ${words} words, above the one-paragraph guide of ${MAX_WHY_IT_MATTERS_WORDS}`,
                storyId: story.id,
                path: `stories[${index}].whyItMatters`,
              },
            ]
          : [];
      }),
  },

  {
    // Credentials in a source URL would be published to every reader and sent in
    // full to whatever the link points at. Section 24 keeps secrets out of
    // committed files, and a content file is a committed file.
    id: "url/no-credentials",
    severity: "blocking",
    evaluate: (edition) =>
      sourceUrls(edition).flatMap(({ index, source, url }) =>
        url.username !== "" || url.password !== ""
          ? [
              {
                message: `source ${source.id} has credentials in its URL`,
                path: `sources[${index}].url`,
              },
            ]
          : [],
      ),
  },
  {
    // A literal address is a source nobody can attribute and, if it is ever
    // fetched, the first half of the SSRF problem section 19 describes.
    id: "url/no-ip-literal",
    severity: "blocking",
    evaluate: (edition) =>
      sourceUrls(edition).flatMap(({ index, source, url }) =>
        isIpLiteral(url.hostname)
          ? [
              {
                message: `source ${source.id} points at the IP literal ${url.hostname} rather than a named host`,
                path: `sources[${index}].url`,
              },
            ]
          : [],
      ),
  },
  {
    id: "url/no-private-host",
    severity: "blocking",
    evaluate: (edition) =>
      sourceUrls(edition).flatMap(({ index, source, url }) =>
        isPrivateHost(url.hostname)
          ? [
              {
                message: `source ${source.id} points at ${url.hostname}, which resolves only inside a private network`,
                path: `sources[${index}].url`,
              },
            ]
          : [],
      ),
  },
  {
    // The rule that actually catches something. An edition where every host is
    // reserved is a deliberate artifact; an edition where every host is real is
    // production content. A mixture is neither, and means invented sources
    // leaked into a real edition or real ones into a sample — which is exactly
    // how a fabricated citation reaches a reader.
    id: "url/mixed-host-classes",
    severity: "blocking",
    evaluate: (edition) => {
      const reserved: string[] = [];
      const real: string[] = [];
      for (const { source, url } of sourceUrls(edition)) {
        (isReservedHost(url.hostname) ? reserved : real).push(source.id);
      }
      if (reserved.length === 0 || real.length === 0) {
        return [];
      }
      // Sorted, like every other rule that lists ids: reordering the `sources`
      // array must not change the bytes of the report.
      return [
        {
          message: `the edition mixes ${reserved.length} reserved-domain sources (${[...reserved].sort().join(", ")}) with ${real.length} real ones (${[...real].sort().join(", ")})`,
          path: "sources",
        },
      ];
    },
  },
  {
    id: "url/sample-data-hosts",
    severity: "warning",
    evaluate: (edition) => {
      const urls = sourceUrls(edition);
      if (
        urls.length === 0 ||
        !urls.every(({ url }) => isReservedHost(url.hostname))
      ) {
        return [];
      }
      return [
        {
          message:
            "every source points at a reserved domain, so this is development sample data and the edition is not publishable",
          path: "sources",
        },
      ];
    },
  },
  {
    // The schema already restricts the scheme to http or https. Plain http still
    // leaves a reader's request for a source readable in transit, so it is worth
    // saying; some archives are genuinely http-only, so it does not block.
    id: "url/https-only",
    severity: "warning",
    evaluate: (edition) =>
      sourceUrls(edition).flatMap(({ index, source, url }) =>
        url.protocol === "http:"
          ? [
              {
                message: `source ${source.id} links over plain http`,
                path: `sources[${index}].url`,
              },
            ]
          : [],
      ),
  },

  {
    // The schema enforces that a note implies status `corrected`. This is the
    // converse, and it is the direction that hides a correction: an edition
    // marked corrected with no note tells a reader something changed and never
    // says what, which section 46 treats as a silent rewrite.
    id: "correction/status-requires-note",
    severity: "blocking",
    evaluate: (edition) =>
      edition.status === "corrected" && edition.correctionNotes.length === 0
        ? [
            {
              message:
                "the edition is marked corrected but carries no correction note",
              path: "correctionNotes",
            },
          ]
        : [],
  },
  {
    // Version 1 is the original publication, so every version above it was
    // produced by a correction that must be on the record.
    id: "correction/version-requires-note",
    severity: "blocking",
    evaluate: (edition) =>
      edition.editionVersion >= 2 && edition.correctionNotes.length === 0
        ? [
            {
              message: `the edition is at version ${edition.editionVersion} but carries no correction note explaining what changed`,
              path: "correctionNotes",
            },
          ]
        : [],
  },
  {
    // A correction timestamped before publication is a correction to something
    // no reader saw, which means either the timestamp or the history is wrong.
    id: "correction/corrected-after-published",
    severity: "blocking",
    evaluate: (edition) =>
      edition.correctionNotes.flatMap((note, index) =>
        Date.parse(note.correctedAt) < Date.parse(edition.publishedAt)
          ? [
              {
                message: `correction ${note.id} is dated ${note.correctedAt}, before the edition was published at ${edition.publishedAt}`,
                storyId: note.storyId,
                path: `correctionNotes[${index}].correctedAt`,
              },
            ]
          : [],
      ),
  },
  {
    id: "correction/corrected-within-updated",
    severity: "blocking",
    evaluate: (edition) =>
      edition.correctionNotes.flatMap((note, index) =>
        Date.parse(note.correctedAt) > Date.parse(edition.updatedAt)
          ? [
              {
                message: `correction ${note.id} is dated ${note.correctedAt}, after the edition was last updated at ${edition.updatedAt}`,
                storyId: note.storyId,
                path: `correctionNotes[${index}].correctedAt`,
              },
            ]
          : [],
      ),
  },
  {
    // A correction whose story did not change afterwards is a correction that
    // was recorded and not made. Section 46 requires the record and the text to
    // agree; the alternative is the silent rewrite in reverse.
    id: "correction/story-reflects-correction",
    severity: "blocking",
    evaluate: (edition) => {
      const stories = storiesById(edition);
      return edition.correctionNotes.flatMap((note, index) => {
        const story = stories.get(note.storyId);
        if (story === undefined) {
          return [];
        }
        return Date.parse(story.updatedAt) < Date.parse(note.correctedAt)
          ? [
              {
                message: `correction ${note.id} is dated ${note.correctedAt} but story ${story.id} was last updated at ${story.updatedAt}, so the correction did not change it`,
                storyId: story.id,
                path: `correctionNotes[${index}]`,
              },
            ]
          : [];
      });
    },
  },
];

function sourcesById(edition: Edition): ReadonlyMap<string, SourceReference> {
  return new Map(edition.sources.map((source) => [source.id, source]));
}

function storiesById(edition: Edition): ReadonlyMap<string, Story> {
  return new Map(edition.stories.map((story) => [story.id, story]));
}

/** The cited sources of one story, in citation order, skipping any that the
 * edition does not carry. Unresolved ids are the schema's error to report. */
function resolveSources(
  story: Story,
  sources: ReadonlyMap<string, SourceReference>,
): SourceReference[] {
  return story.sourceIds.flatMap((id) => {
    const source = sources.get(id);
    return source === undefined ? [] : [source];
  });
}

/** Every source some story cites, in edition source order. */
function citedSources(edition: Edition): SourceReference[] {
  const cited = new Set(edition.stories.flatMap((story) => story.sourceIds));
  return edition.sources.filter((source) => cited.has(source.id));
}

function coreStories(edition: Edition): Story[] {
  const stories = storiesById(edition);
  return edition.coreStoryIds.flatMap((id) => {
    const story = stories.get(id);
    return story === undefined ? [] : [story];
  });
}

/**
 * The eight core stories plus the two longest pooled ones: what a reader
 * actually receives, per PRD section 5.2.
 */
function visibleStories(edition: Edition): Story[] {
  const stories = storiesById(edition);
  const core = new Set(edition.coreStoryIds);
  const pooledIds = new Set(
    Object.values(edition.interestPools)
      .flatMap((ids) => ids ?? [])
      .filter((id) => !core.has(id)),
  );
  const pooled = [...pooledIds]
    .flatMap((id) => {
      const story = stories.get(id);
      return story === undefined ? [] : [story];
    })
    .sort(
      (a, b) =>
        visibleWordCount(b) - visibleWordCount(a) || (a.id < b.id ? -1 : 1),
    )
    .slice(0, 2);
  return [...coreStories(edition), ...pooled];
}

function visibleWordCount(story: Story): number {
  const parts = [
    story.deck,
    ...story.whatChanged,
    story.whyItMatters,
    ...(story.uncertainty === undefined ? [] : [story.uncertainty]),
  ];
  return parts.reduce((total, part) => total + wordCount(part), 0);
}

/**
 * A word is a whitespace-separated token holding at least one letter or digit,
 * so a stray dash between paragraphs is not counted as reading time.
 */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;
}

/** The story fields a reader sees as prose, paired with a path fragment. */
function readerVisibleFields(story: Story): [string, string][] {
  const fields: [string, string][] = [
    ["headline", story.headline],
    ["deck", story.deck],
    ...story.whatChanged.map((paragraph, index): [string, string] => [
      `whatChanged[${index}]`,
      paragraph,
    ]),
    ["whyItMatters", story.whyItMatters],
  ];
  if (story.background !== undefined) {
    fields.push(["background", story.background]);
  }
  if (story.uncertainty !== undefined) {
    fields.push(["uncertainty", story.uncertainty]);
  }
  return fields;
}

function containsMarkup(text: string): boolean {
  return MARKUP_PATTERNS.some((pattern) => pattern.test(text));
}

/** Lowercased, punctuation replaced by spaces, so matching is on words only. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalized tokens with short and empty words dropped, for the heuristics. */
function significantTokens(text: string): Set<string> {
  const tokens = normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !SIMILARITY_STOPWORDS.has(token));
  return new Set(tokens);
}

function diceCoefficient(first: Set<string>, second: Set<string>): number {
  if (first.size === 0 || second.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of first) {
    if (second.has(token)) {
      shared += 1;
    }
  }
  return (2 * shared) / (first.size + second.size);
}

function matchesHardNews(story: Story): boolean {
  const text = ` ${normalizeText(`${story.headline} ${story.deck}`)} `;
  return HARD_NEWS_TERMS.some((term) =>
    new RegExp(`\\b${term}s?\\b`).test(text),
  );
}

function sharedSourceIds(first: Story, second: Story): string[] {
  const secondIds = new Set(second.sourceIds);
  return first.sourceIds.filter((id) => secondIds.has(id));
}

/** Every unordered story pair, in edition order, so output is stable. */
function storyPairs(
  edition: Edition,
): { first: Story; second: Story; secondIndex: number }[] {
  const pairs: { first: Story; second: Story; secondIndex: number }[] = [];
  edition.stories.forEach((first, firstIndex) => {
    edition.stories.slice(firstIndex + 1).forEach((second, offset) => {
      pairs.push({ first, second, secondIndex: firstIndex + 1 + offset });
    });
  });
  return pairs;
}

/** Source URLs already parsed, skipping any the URL parser rejects — the schema
 * rejects those first, so a rule reporting them again would only duplicate it. */
function sourceUrls(
  edition: Edition,
): { index: number; source: SourceReference; url: URL }[] {
  return edition.sources.flatMap((source, index) => {
    try {
      return [{ index, source, url: new URL(source.url) }];
    } catch {
      return [];
    }
  });
}

function isIpLiteral(hostname: string): boolean {
  // The URL parser wraps an IPv6 host in brackets, which no named host carries.
  // It also strips the trailing dot from an IPv4 literal, so `192.0.2.10.` is
  // already `192.0.2.10` by the time a rule sees it.
  return hostname.startsWith("[") || IPV4_PATTERN.test(hostname);
}

/**
 * The hostname with the DNS root's optional trailing dot removed.
 *
 * `https://example.com./x` and `https://example.com/x` address the same host and
 * the schema accepts both, so every classification below has to agree about
 * them. Without this, one character on the end of a hostname walks past every
 * reserved-domain and private-network rule: the last label of `example.com.` is
 * the empty string, and `intranet.internal.` ends with no suffix in the list.
 */
function canonicalHostname(hostname: string): string {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function isPrivateHost(rawHostname: string): boolean {
  const hostname = canonicalHostname(rawHostname);
  return (
    hostname === "localhost" ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function isReservedHost(rawHostname: string): boolean {
  const hostname = canonicalHostname(rawHostname);
  const labels = hostname.split(".");
  const tld = labels[labels.length - 1];
  if (tld !== undefined && RESERVED_TLDS.includes(tld)) {
    return true;
  }
  return RESERVED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

/** Map entries sorted by key, so a rule's output never depends on insertion
 * order. */
function sortedEntries<T>(map: ReadonlyMap<string, T>): [string, T][] {
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
