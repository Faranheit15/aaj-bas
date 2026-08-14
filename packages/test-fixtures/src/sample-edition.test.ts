/**
 * The AB-102 sample edition, checked against the contract it was written for.
 *
 * The test lives here because `bun run test` runs `bun run --filter @aaj-bas/*
 * test`, so a test only runs at all inside a workspace package, and this is the
 * only package it belongs in. `packages/schemas` is wrong: ADR-0005 records that
 * the contract package's tests build their objects inline and depend on nothing,
 * so pointing them at editorial content would report a bad edition as a failure
 * of the contract. `apps/web` is wrong: loading editions is AB-201's job, and
 * this file is not waiting on it. `packages/test-fixtures` is already test-only
 * and already depends on `@aaj-bas/schemas`, and section 10 forbids production
 * applications from importing this package at runtime, so a sample edition
 * reached from here cannot end up in a bundle.
 *
 * AB-103 subsumed most of what this file used to assert. `bun run content:validate`
 * now applies structural, diversity, duplicate, length, URL, and correction rules
 * to every file in `content/editions/`, and it runs in the blocking check suite,
 * so the story count, the publisher floor, and the correction assertions were
 * removed rather than left to duplicate a rule. Three checks stay, for reasons
 * the validator does not cover:
 *
 * - the schema parse, which is cheap and localises a contract break to this file
 *   instead of to a CLI report;
 * - the unresolvable-hostname check, which is about this sample data specifically;
 * - the state coverage, which is AB-102's deliverable rather than a property of
 *   editions in general.
 *
 * The last two are each documented at the assertion, because both look
 * removable to someone who has just read the validator's rule list.
 */

import type { Edition } from "@aaj-bas/schemas";
import { editionSchema } from "@aaj-bas/schemas";
import { describe, expect, it } from "vitest";
import sampleEditionJson from "../../../content/editions/2026-07-21.json";

/**
 * Imported rather than read with `node:fs`, and immediately widened to
 * `unknown`.
 *
 * Reading the file would need `@types/node`, which this repository does not
 * install anywhere; adding it to satisfy one test is the kind of dependency
 * section 11 asks to avoid when the platform already offers a way, and
 * `resolveJsonModule` is already on. The widening is the load-bearing part: a
 * JSON import arrives already typed, and letting that type stand would have
 * TypeScript assert the shape this file exists to check. As `unknown`,
 * `safeParse` still has real work to do.
 *
 * The import also fails the build outright if the edition is missing or is not
 * valid JSON, which is louder than discovering it at run time.
 */
const sampleEdition: unknown = sampleEditionJson;

const result = editionSchema.safeParse(sampleEdition);

/**
 * The parsed edition, for the assertion that is about content rather than about
 * the contract.
 *
 * Narrowing through the parse result means that assertion reads typed data
 * instead of re-inspecting `unknown`. When the parse failed, the contract test
 * below is the honest failure and this throws rather than reporting a second,
 * derived one.
 */
function parsedEdition(): Edition {
  if (!result.success) {
    throw new Error(
      "the sample edition does not satisfy editionSchema; see the contract test for the failing rule",
    );
  }
  return result.data;
}

describe("the AB-102 sample edition", () => {
  it("satisfies the edition contract", () => {
    // Issues first: a bare `success` assertion says only "false", while this
    // names the rule the edition broke and the path it broke it at.
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("cites nothing that could resolve", () => {
    // The machine-checkable half of "clearly marked as development sample
    // data": RFC 2606 reserves `.invalid`, so no source link can ever reach a
    // real publisher, and section 18 stays satisfied by construction rather
    // than by an author remembering.
    //
    // Do not delete this as covered by `bun run content:validate`. It is not.
    // The validator's `url/sample-data-hosts` rule only *observes* that every
    // host is reserved and marks the edition not publishable; it does not
    // require it, and it must never require it, because a global rule of that
    // shape would block the first real edition. The requirement is a property
    // of this development sample data alone, so it is asserted here alone.
    for (const source of parsedEdition().sources) {
      expect(new URL(source.url).hostname).toMatch(/\.invalid$/);
    }
  });

  it("still demonstrates every state AB-102 was written to show", () => {
    // Also not covered by `bun run content:validate`, and for a subtler reason
    // than the check above. The validator has rules *about* reportingType,
    // confidence and uncertainty, but none that requires an edition to exhibit
    // all of them, and none ever should: a real edition on a quiet day may
    // legitimately carry no disputed story and no correction.
    //
    // Demonstrating them is this fixture's whole job. AB-201 builds the reader
    // against it, so a state quietly disappearing here would surface as a UI
    // path nobody exercised rather than as a failing test.
    const edition = parsedEdition();
    const reportingTypes = new Set(
      edition.stories.map((story) => story.reportingType),
    );
    const confidences = new Set(edition.stories.map((s) => s.confidence));

    expect([...reportingTypes]).toEqual(
      expect.arrayContaining(["reporting", "analysis", "official"]),
    );
    expect(confidences.has("single-source")).toBe(true);
    expect(confidences.has("multi-source")).toBe(true);
    expect(edition.stories.some((s) => s.uncertainty !== undefined)).toBe(true);
    // Compared as instants: two timestamps in different offsets can be the same
    // moment while sorting in the wrong order as strings.
    expect(
      edition.stories.some(
        (s) => Date.parse(s.updatedAt) > Date.parse(s.firstPublishedAt),
      ),
    ).toBe(true);
    expect(edition.correctionNotes.length).toBeGreaterThanOrEqual(1);
  });
});
