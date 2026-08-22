import { describe, expect, it } from "vitest";
import type { SourceStatus } from "../source-registry";
import { sourceRegistrySchema } from "../source-registry";
import { fetchableSourceOf, fetchableSourcesOf } from "./source";

function registry() {
  return sourceRegistrySchema.parse({
    schemaVersion: 1,
    sources: [
      {
        id: "desk-daily",
        publisher: "Desk Daily",
        siteUrl: "https://desk-daily.co.in/",
        feedUrl: "https://desk-daily.co.in/feed.xml",
        sourceType: "publisher",
        region: "india",
        language: "en",
        active: true,
        sample: false,
        termsUrl: "https://desk-daily.co.in/terms",
        termsReviewedOn: "2026-07-21",
        termsReviewedBy: "faran",
        permittedUse:
          "Headlines and the supplied description may be reused with attribution and a link to the original article.",
        permittedUses: ["headline", "supplied-description"],
        attribution: "Desk Daily",
      },
      {
        id: "draft-wire",
        publisher: "Draft Wire",
        siteUrl: "https://draft-wire.co.in/",
        feedUrl: "https://draft-wire.co.in/feed.xml",
        sourceType: "publisher",
        region: "india",
        language: "en",
        active: false,
        sample: false,
      },
      {
        id: "sample-wire",
        publisher: "Sample Wire",
        siteUrl: "https://sample-wire.example/",
        feedUrl: "https://sample-wire.example/feed.xml",
        sourceType: "publisher",
        region: "world",
        language: "en",
        active: false,
        sample: true,
      },
    ],
  });
}

describe("fetchableSourceOf", () => {
  it("pairs only an active entry with the validator's positive status", () => {
    const parsed = registry();
    const active = parsed.sources[0];
    const draft = parsed.sources[1];
    const sample = parsed.sources[2];
    if (active === undefined || draft === undefined || sample === undefined) {
      throw new Error("the fixture is incomplete");
    }

    const approved: SourceStatus = {
      sourceId: active.id,
      fetchable: true,
    };
    expect(fetchableSourceOf(active, approved)?.entry.id).toBe("desk-daily");
    expect(
      fetchableSourceOf(active, { sourceId: active.id, fetchable: false }),
    ).toBeUndefined();
    expect(
      fetchableSourceOf(draft, { sourceId: draft.id, fetchable: true }),
    ).toBeUndefined();
    expect(
      fetchableSourceOf(sample, { sourceId: sample.id, fetchable: true }),
    ).toBeUndefined();
    expect(
      fetchableSourceOf(active, { sourceId: "other-source", fetchable: true }),
    ).toBeUndefined();
  });
});

describe("fetchableSourcesOf", () => {
  it("keeps registry order and does not recompute a blocking verdict", () => {
    const parsed = registry();
    const statuses: readonly SourceStatus[] = [
      { sourceId: "sample-wire", fetchable: false },
      { sourceId: "desk-daily", fetchable: true },
      { sourceId: "draft-wire", fetchable: false },
    ];

    expect(
      fetchableSourcesOf(parsed, statuses).map((source) => source.entry.id),
    ).toEqual(["desk-daily"]);
  });
});
