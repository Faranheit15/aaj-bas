import { describe, expect, it } from "vitest";
import { editionFreshness } from "./edition-freshness";

describe("editionFreshness", () => {
  it("calls today's edition at the latest address current", () => {
    expect(editionFreshness("latest", "2026-07-21", "2026-07-21")).toBe(
      "current",
    );
  });

  it("calls an older edition at the latest address stale", () => {
    expect(editionFreshness("latest", "2026-07-20", "2026-07-21")).toBe(
      "stale",
    );
  });

  it("compares across a month boundary", () => {
    expect(editionFreshness("latest", "2026-07-31", "2026-08-01")).toBe(
      "stale",
    );
  });

  it("does not blame the edition when the device clock is behind", () => {
    // The edition is dated ahead of the device's today. The content is not at
    // fault, so it must not be labelled stale.
    expect(editionFreshness("latest", "2026-07-22", "2026-07-21")).toBe(
      "current",
    );
  });

  it("calls a deliberately chosen edition archived, whatever its date", () => {
    expect(editionFreshness("edition", "2026-07-14", "2026-07-21")).toBe(
      "archived",
    );
    expect(editionFreshness("edition", "2026-07-21", "2026-07-21")).toBe(
      "archived",
    );
  });
});
