/**
 * The source registry: which publishers the pipeline may read, and the terms
 * review that says it may.
 *
 * This contract lives in `packages/domain` rather than `packages/schemas`
 * because it is not published content. Section 10 keeps the schemas package to
 * what a reader receives; the registry is an operational input to the process
 * that produces an edition, and no reader ever sees it.
 *
 * Section 18 is why it exists. An RSS feed grants nothing by existing, so the
 * registry records which terms a human read, when, who read them, what the
 * terms allow, and the credit those terms require — and the shape below refuses
 * to describe a source as active without all of it. The enforcement is
 * structural rather than procedural: the union means a future slice cannot
 * construct an active source with the review fields missing, not merely that a
 * check would complain if it did.
 */
import {
  boundedText,
  duplicatesIn,
  editionDateSchema,
  identifierSchema,
  sourceTypeSchema,
  sourceUrlSchema,
} from "@aaj-bas/schemas";
import type { ReportingType, Story } from "@aaj-bas/schemas";
import { z } from "zod";

/**
 * Where a source reports from, from PRD section 13.3's regional split.
 *
 * The vocabularies here are closed enums and every schema below is strict, in
 * deliberate contrast to ADR-0008, which accepts an unknown interest slug
 * rather than discarding a reader's state. That leniency is about data on a
 * reader's device that nobody can recover once it is dropped. This file is
 * checked out with the code that reads it, so a value the code does not
 * understand is a mistake that fails a CI check in the same pull request that
 * introduced it, and costs a commit rather than somebody's settings.
 */
export const SOURCE_REGIONS = ["india", "south-asia", "world"] as const;

export const sourceRegionSchema = z.enum(SOURCE_REGIONS);
export type SourceRegion = z.infer<typeof sourceRegionSchema>;

/** The languages the product can currently read. One, honestly stated. */
export const SOURCE_LANGUAGES = ["en"] as const;

export const sourceLanguageSchema = z.enum(SOURCE_LANGUAGES);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

/**
 * What the reviewed terms permit the product to do with a source's material.
 *
 * There is deliberately no `image` value. Section 18 forbids displaying
 * publisher photography, nothing in the product renders a source image, and a
 * permission the product cannot exercise is an invitation to build the feature
 * that exercises it — recorded once, it reads later as approval rather than as
 * the decision it never was.
 */
export const PERMITTED_USES = [
  "headline",
  "supplied-description",
  "generated-summary",
] as const;

export const permittedUseSchema = z.enum(PERMITTED_USES);
export type PermittedUse = z.infer<typeof permittedUseSchema>;

/**
 * The URL a fetcher will actually request, and the strictest field in the file.
 *
 * `https:` only, and blocking. A feed fetched over plain http lets anyone on
 * the path choose what a news product reports, which is the whole product
 * failing rather than a transport detail; `sourceUrlSchema` tolerates http for
 * a link a reader clicks, and this is not that. The cost of the rule is zero
 * today because no entry exists yet to grandfather, and it will never be
 * cheaper than it is now.
 *
 * Credentials are rejected because section 24 keeps secrets out of committed
 * files and this file is committed. A non-default port is rejected because a
 * published feed does not live on one, and a port is how a request aimed at a
 * publisher becomes a request aimed at something on the build machine. A
 * fragment is rejected because a fetcher never sends it: it would be a note to
 * a human written where no human reads it.
 */
const feedUrlSchema = z
  .url()
  .max(2048)
  .superRefine((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      // `z.url()` has already reported it; a second issue would only repeat.
      return;
    }

    // The protocol check runs first and returns, and that ordering is a
    // correctness property rather than a style. `file:`, `javascript:` and
    // `data:` all parse with `hostname === ""`, so every host-shaped check --
    // here and in `rules.ts` -- passes them vacuously. Nothing below may run
    // for a URL whose scheme was never allowed in the first place.
    if (url.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: `a feed URL must use https, not ${url.protocol}`,
      });
      return;
    }

    if (url.username !== "" || url.password !== "") {
      ctx.addIssue({
        code: "custom",
        message: "a feed URL must not carry credentials",
      });
    }

    // The URL parser drops the scheme's default port, so anything left here is
    // by definition not the default.
    if (url.port !== "") {
      ctx.addIssue({
        code: "custom",
        message: `a feed URL must not name a port, found ${url.port}`,
      });
    }

    if (url.hash !== "") {
      ctx.addIssue({
        code: "custom",
        message:
          "a feed URL must not carry a fragment, which a fetcher never sends",
      });
    }
  });

/**
 * The name or handle of the person who read the terms.
 *
 * An `@` is rejected because the obvious thing to write here is an email
 * address, and an email address in a public repository is personal data the
 * product never needed to collect. A name or a handle identifies the reviewer
 * to the people who work on this repository, which is the whole requirement.
 */
const reviewerSchema = boundedText(2, 80).refine(
  (value) => !value.includes("@"),
  { message: "must be a name or handle, not an email address" },
);

/** Fields every entry carries, whatever its review state. */
const sourceEntryBase = {
  id: identifierSchema,
  publisher: boundedText(1, 120),
  /** Where a human goes to read about the publisher. Shared entries are fine:
   * one site can legitimately publish several feeds. */
  siteUrl: sourceUrlSchema,
  feedUrl: feedUrlSchema,
  sourceType: sourceTypeSchema,
  region: sourceRegionSchema,
  language: sourceLanguageSchema,
};

/** The terms review, required together or not at all. See the union below. */
const termsReview = {
  termsUrl: sourceUrlSchema,
  /** Direct licence URL when the terms page points to a distinct licence. */
  licenseUrl: sourceUrlSchema.optional(),
  /**
   * The calendar day the terms were read, not an instant. Section 41 keeps the
   * two apart, and the `-On` suffix is the visible half of that rule: every
   * `*At` field in this repository is a timestamp, so a day named `*At` would
   * be read as one by the next person to add a field.
   */
  termsReviewedOn: editionDateSchema,
  termsReviewedBy: reviewerSchema,
  /**
   * What the reviewer concluded, in their own words, with the enumeration
   * beside it. The lower bound is 40 characters after trimming -- so a field of
   * spaces fails rather than passing as text -- because a note shorter than
   * that is a placeholder, and a placeholder here would claim a review that did
   * not happen.
   */
  permittedUse: boundedText(40, 600),
  permittedUses: z.array(permittedUseSchema).min(1),
  /**
   * The credit line the terms require, exactly as they require it.
   *
   * Required rather than optional because it is a term, not a preference: a
   * publisher who permits reuse on condition of a credit has granted nothing
   * until the credit is given, so an entry recording the permission without
   * recording its condition records half a review. PRD section 10.1 lists it
   * and AB-401's deliverables name it; AB-402 and AB-404 have nothing to render
   * beside a story without it.
   *
   * It is deliberately not derived from `publisher`. What a publisher calls
   * itself and what its terms demand be printed are different strings often
   * enough — a wire service credited as its parent, a masthead with a legal
   * suffix — that inferring one from the other would fabricate the term this
   * field exists to record.
   */
  attribution: boundedText(2, 200),
};

/**
 * A source the pipeline may fetch.
 *
 * The active/inactive split is a discriminated union rather than a boolean plus
 * a cross-field check, and that is the most consequential decision in this
 * file. The union makes the review requirement travel into every consumer as a
 * type: `if (source.active)` narrows `permittedUse` to `string`, and no future
 * slice can construct an active source with the review fields missing. A
 * `superRefine` would enforce the same rule at parse time and nothing at all at
 * the call site, where the fabrication would actually be written.
 */
const activeSourceEntrySchema = z.strictObject({
  ...sourceEntryBase,
  active: z.literal(true),
  sample: z.literal(false),
  ...termsReview,
});

/**
 * A source that is recorded but not fetched.
 *
 * Every review field is independently optional, because a half-reviewed
 * inactive source is an honest drafting state: somebody found the feed, has not
 * finished reading the terms, and writing down what they have so far is better
 * than keeping it in a branch. Nothing fetches it until `active` flips, and
 * flipping it requires all six fields.
 */
const inactiveSourceEntrySchema = z.strictObject({
  ...sourceEntryBase,
  active: z.literal(false),
  sample: z.literal(false),
  termsUrl: termsReview.termsUrl.optional(),
  termsReviewedOn: termsReview.termsReviewedOn.optional(),
  termsReviewedBy: termsReview.termsReviewedBy.optional(),
  permittedUse: termsReview.permittedUse.optional(),
  permittedUses: termsReview.permittedUses.optional(),
  attribution: termsReview.attribution.optional(),
  licenseUrl: termsReview.licenseUrl,
});

/**
 * A fixture entry, which exists so the tooling can be exercised before a real
 * publisher is registered.
 *
 * A sample cannot carry a terms review at all: the keys are not in its shape,
 * and `strictObject` rejects an unrecognised key, so a fabricated review cannot
 * be written into a sample even by accident. `active` is fixed false, so a
 * sample can never be fetched. This is a mechanism rather than a convention,
 * and `rules.ts` completes it: a sample's host must be reserved, a real
 * source's must not be, and a registry mixing the two is blocking — so the pull
 * request that registers the first real publisher has to delete the samples.
 */
const sampleSourceEntrySchema = z.strictObject({
  ...sourceEntryBase,
  active: z.literal(false),
  sample: z.literal(true),
});

export const sourceEntrySchema = z.discriminatedUnion("active", [
  activeSourceEntrySchema,
  z.discriminatedUnion("sample", [
    inactiveSourceEntrySchema,
    sampleSourceEntrySchema,
  ]),
]);

export type SourceEntry = z.infer<typeof sourceEntrySchema>;
export type ActiveSourceEntry = z.infer<typeof activeSourceEntrySchema>;

export const sourceRegistrySchema = z
  .strictObject({
    /**
     * Bumped only by a contract change. The registry is read only by the commit
     * it is checked out with, so this is a tripwire for a stale tool rather
     * than the compatibility promise `editionSchema` makes to a reader.
     */
    schemaVersion: z.literal(1),
    sources: z.array(sourceEntrySchema).min(1),
  })
  .superRefine((registry, ctx) => {
    duplicatesIn(registry.sources.map((source) => source.id)).forEach((id) => {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: `duplicate source id ${id}`,
      });
    });

    duplicatesIn(registry.sources.map((source) => feedUrlKey(source))).forEach(
      (href) => {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: `duplicate feed URL ${href}`,
        });
      },
    );
  });

export type SourceRegistry = z.infer<typeof sourceRegistrySchema>;

/**
 * The feed URL as the URL parser writes it back.
 *
 * The parser lowercases the scheme and the host and drops a default port, so
 * three spellings of one origin collapse to one key here and a duplicate is
 * caught rather than fetched twice.
 *
 * Normalisation stops there, deliberately. A trailing slash is a different
 * resource under RFC 3986, and a registry is exactly where a publisher might
 * serve two feeds whose paths differ by one character; folding them here would
 * silently drop a real feed on a guess. `rules.ts` warns about the pairs this
 * key keeps apart, which puts the judgement in front of a human instead of
 * making it in the schema.
 */
export function feedUrlKey(source: SourceEntry): string {
  try {
    return new URL(source.feedUrl).href;
  } catch {
    return source.feedUrl;
  }
}

/** The review note, for the entry shapes that have somewhere to put one. */
export function permittedUseNoteOf(source: SourceEntry): string | undefined {
  return "permittedUse" in source ? source.permittedUse : undefined;
}

/** Whether a source in a validated registry permits one downstream use. */
export function sourcePermitsUse(
  sourceId: string,
  use: PermittedUse,
  registry: SourceRegistry | undefined,
): boolean {
  if (registry === undefined) {
    return true;
  }

  const source = registry.sources.find((entry) => entry.id === sourceId);
  return source?.active === true && source.permittedUses.includes(use);
}

/**
 * Keep official statements from being presented as independently reported.
 * A provider may return any valid reporting type, so this deterministic
 * post-condition belongs at the registry boundary as well as in validation.
 */
export function reportingTypeForReviewedSources(
  story: Story,
  registry: SourceRegistry | undefined,
): ReportingType {
  if (registry === undefined || story.sourceIds.length === 0) {
    return story.reportingType;
  }

  const citedSources = story.sourceIds.map((sourceId) =>
    registry.sources.find((source) => source.id === sourceId),
  );
  if (
    citedSources.some((source) => source === undefined) ||
    !citedSources.every((source) => source?.sourceType === "official")
  ) {
    return story.reportingType;
  }

  return "official";
}
