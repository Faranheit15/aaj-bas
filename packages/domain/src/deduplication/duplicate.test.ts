import { describe, expect, it } from "vitest";
import type { NormalizedFeedItem } from "../feed-normalization";
import {
  calculateTimeDeltaHours,
  classifyDuplicate,
  getExactDuplicateReason,
  isExactDuplicate,
  isNearDuplicate,
} from "./duplicate";

describe("exact and near duplicate detection", () => {
  const baseItem: NormalizedFeedItem = {
    sourceId: "the-hindu",
    guid: "guid-1",
    title: "ISRO launches navigation satellite NVS-02 successfully",
    description: "Launch details",
    url: "https://www.thehindu.com/sci-tech/isro-launch/article1.ece",
    publishedAt: "2026-08-20T10:00:00.000Z",
    updatedAt: null,
    contentHash: "hash-100",
  };

  it("detects exact duplicate by canonical URL", () => {
    const itemB: NormalizedFeedItem = {
      ...baseItem,
      sourceId: "ndtv",
      guid: "guid-2",
      contentHash: "hash-200",
    };

    expect(isExactDuplicate(baseItem, itemB)).toBe(true);
    expect(getExactDuplicateReason(baseItem, itemB)).toBe("canonical_url");
    expect(classifyDuplicate(baseItem, itemB)).toEqual({
      matchType: "exact",
      reason: "canonical_url",
    });
  });

  it("detects exact duplicate by content hash", () => {
    const itemB: NormalizedFeedItem = {
      ...baseItem,
      sourceId: "ndtv",
      url: "https://www.ndtv.com/article2",
      guid: "guid-2",
      contentHash: "hash-100",
    };

    expect(isExactDuplicate(baseItem, itemB)).toBe(true);
    expect(getExactDuplicateReason(baseItem, itemB)).toBe("content_hash");
    expect(classifyDuplicate(baseItem, itemB)).toEqual({
      matchType: "exact",
      reason: "content_hash",
    });
  });

  it("detects exact duplicate by source GUID", () => {
    const itemB: NormalizedFeedItem = {
      ...baseItem,
      url: "https://www.thehindu.com/sci-tech/isro-launch/article1-updated.ece",
      contentHash: "hash-200",
    };

    expect(isExactDuplicate(baseItem, itemB)).toBe(true);
    expect(getExactDuplicateReason(baseItem, itemB)).toBe("source_guid");
  });

  it("detects near-duplicates within the publication window", () => {
    const itemB: NormalizedFeedItem = {
      sourceId: "indian-express",
      guid: "guid-ie",
      title:
        "ISRO successfully launches NVS-02 navigation satellite from Sriharikota",
      description: "Indian Express report",
      url: "https://indianexpress.com/article/isro-satellite",
      publishedAt: "2026-08-20T11:00:00.000Z",
      updatedAt: null,
      contentHash: "hash-ie",
    };

    expect(isNearDuplicate(baseItem, itemB)).toBe(true);
    const classification = classifyDuplicate(baseItem, itemB);
    expect(classification.matchType).toBe("near");
    if (classification.matchType === "near") {
      expect(classification.score).toBeGreaterThan(0.65);
      expect(classification.timeDeltaHours).toBe(1);
    }
  });

  it("rejects near-duplicates when publication delta exceeds cutoff", () => {
    const itemOld: NormalizedFeedItem = {
      ...baseItem,
      url: "https://example.com/old",
      contentHash: "hash-old",
      guid: "guid-old",
      publishedAt: "2026-08-10T10:00:00.000Z", // 10 days earlier (> 72h)
    };

    expect(isNearDuplicate(baseItem, itemOld)).toBe(false);
    const classification = classifyDuplicate(baseItem, itemOld);
    expect(classification.matchType).toBe("distinct");
  });

  it("calculates time delta hours accurately", () => {
    expect(
      calculateTimeDeltaHours(
        "2026-08-20T10:00:00.000Z",
        "2026-08-20T14:30:00.000Z",
      ),
    ).toBe(4.5);
    expect(
      calculateTimeDeltaHours(null, "2026-08-20T10:00:00.000Z"),
    ).toBeNull();
    expect(
      calculateTimeDeltaHours("invalid", "2026-08-20T10:00:00.000Z"),
    ).toBeNull();
  });
});
