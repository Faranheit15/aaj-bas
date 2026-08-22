import { describe, expect, it } from "vitest";
import type { NormalizedFeedItem } from "../feed-normalization";
import { selectRepresentativeTitle } from "./representative-title";

describe("selectRepresentativeTitle", () => {
  it("returns empty result for empty items array", () => {
    expect(selectRepresentativeTitle([])).toEqual({
      representativeTitle: "",
      cleanedTitle: "",
    });
  });

  it("returns single item title and cleaned title", () => {
    const item: NormalizedFeedItem = {
      sourceId: "the-hindu",
      guid: "g-1",
      title: "LIVE: Sensex falls 500 points on inflation concerns - The Hindu",
      description: "description",
      url: "https://example.com/1",
      publishedAt: "2026-08-20T10:00:00.000Z",
      updatedAt: null,
      contentHash: "h-1",
    };

    const result = selectRepresentativeTitle([item]);
    expect(result.representativeTitle).toBe(
      "LIVE: Sensex falls 500 points on inflation concerns - The Hindu",
    );
    expect(result.cleanedTitle).toBe(
      "Sensex falls 500 points on inflation concerns",
    );
  });

  it("selects medoid title from multi-source cluster", () => {
    const item1: NormalizedFeedItem = {
      sourceId: "the-hindu",
      guid: "g-1",
      title:
        "ISRO launches navigation satellite NVS-02 successfully - The Hindu",
      description: "Launch",
      url: "https://example.com/1",
      publishedAt: "2026-08-20T10:00:00.000Z",
      updatedAt: null,
      contentHash: "h-1",
    };
    const item2: NormalizedFeedItem = {
      sourceId: "indian-express",
      guid: "g-2",
      title:
        "ISRO successfully launches NVS-02 navigation satellite from Sriharikota",
      description: "Launch",
      url: "https://example.com/2",
      publishedAt: "2026-08-20T10:15:00.000Z",
      updatedAt: null,
      contentHash: "h-2",
    };
    const item3: NormalizedFeedItem = {
      sourceId: "ndtv",
      guid: "g-3",
      title: "LIVE: ISRO launches satellite NVS-02 - NDTV",
      description: "Launch",
      url: "https://example.com/3",
      publishedAt: "2026-08-20T10:30:00.000Z",
      updatedAt: null,
      contentHash: "h-3",
    };

    const result = selectRepresentativeTitle([item1, item2, item3]);
    expect(result.cleanedTitle).toContain("NVS-02");
    expect(result.cleanedTitle).toContain("ISRO");
  });
});
