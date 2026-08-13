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
 * This test is INTERIM. AB-103's `bun run content:validate` is the real home for
 * structural, diversity, duplicate, length, URL, and correction checks across
 * every file in `content/editions/`, and should subsume the structural
 * assertions below rather than sit alongside them.
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
 * The parsed edition, for the assertions that are about content rather than
 * about the contract.
 *
 * Narrowing through the parse result means those assertions read typed data
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

  it("carries ten stories", () => {
    // AB-102 asks for ten. The schema requires eight core plus at least two
    // pooled and would accept more, so the count is asserted here, not there.
    expect(parsedEdition().stories).toHaveLength(10);
  });

  it("draws on at least six publishers", () => {
    const publishers = new Set(
      parsedEdition().sources.map((source) => source.publisher),
    );

    expect(publishers.size).toBeGreaterThanOrEqual(6);
  });

  it("cites nothing that could resolve", () => {
    // The machine-checkable half of "clearly marked as development sample
    // data": RFC 2606 reserves `.invalid`, so no source link can ever reach a
    // real publisher, and section 18 stays satisfied by construction rather
    // than by an author remembering.
    for (const source of parsedEdition().sources) {
      expect(new URL(source.url).hostname).toMatch(/\.invalid$/);
    }
  });

  it("covers every state AB-102 names", () => {
    // Named rather than counted, so deleting a state fails here instead of
    // quietly shrinking what the sample edition demonstrates.
    const edition = parsedEdition();
    const reportingTypes = new Set(
      edition.stories.map((story) => story.reportingType),
    );
    const confidences = new Set(
      edition.stories.map((story) => story.confidence),
    );

    expect([...reportingTypes]).toEqual(
      expect.arrayContaining(["reporting", "analysis", "official"]),
    );
    expect(confidences.has("single-source")).toBe(true);
    expect(confidences.has("multi-source")).toBe(true);

    expect(
      edition.stories.some((story) => story.uncertainty !== undefined),
    ).toBe(true);

    // The updated state. Compared as instants, not as strings: two timestamps
    // in different offsets are the same moment but sort in the wrong order.
    expect(
      edition.stories.some(
        (story) =>
          Date.parse(story.updatedAt) > Date.parse(story.firstPublishedAt),
      ),
    ).toBe(true);
  });

  it("keeps its correction visible and attached to a story", () => {
    const edition = parsedEdition();
    const storyIds = new Set(edition.stories.map((story) => story.id));

    expect(edition.correctionNotes.length).toBeGreaterThanOrEqual(1);
    for (const note of edition.correctionNotes) {
      expect(storyIds.has(note.storyId)).toBe(true);
    }
  });
});
