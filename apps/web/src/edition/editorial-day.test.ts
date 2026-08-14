import { describe, expect, it } from "vitest";
import {
  EDITORIAL_TIME_ZONE,
  editorialDay,
  formatEditionDate,
  formatEditionInstant,
} from "./editorial-day";

// vite.config.ts pins the test timezone to America/Los_Angeles, so any accident
// that reads the host zone instead of the editorial one fails here rather than
// in a reader's browser.
describe("editorialDay", () => {
  it("uses the editorial timezone rather than the host one", () => {
    expect(EDITORIAL_TIME_ZONE).toBe("Asia/Kolkata");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe(
      EDITORIAL_TIME_ZONE,
    );
  });

  it("moves to the next day at editorial midnight", () => {
    // 18:30 UTC is 00:00 in Asia/Kolkata.
    expect(editorialDay(new Date("2026-07-20T18:45:00Z"))).toBe("2026-07-21");
  });

  it("stays on the day before editorial midnight", () => {
    expect(editorialDay(new Date("2026-07-20T18:15:00Z"))).toBe("2026-07-20");
  });

  it("pads month and day to two digits", () => {
    expect(editorialDay(new Date("2026-01-05T06:00:00Z"))).toBe("2026-01-05");
  });

  it("does not shift the day for an instant already in the editorial zone", () => {
    expect(editorialDay(new Date("2026-08-13T06:00:00+05:30"))).toBe(
      "2026-08-13",
    );
  });
});

describe("formatEditionDate", () => {
  it("names the weekday of the edition date itself", () => {
    // Asserted loosely enough that an ICU update cannot red-line CI, and
    // strictly enough to catch a day shifted by a timezone.
    const formatted = formatEditionDate("2026-07-21");

    expect(formatted).toMatch(/^Tuesday/);
    expect(formatted).toContain("21");
    expect(formatted).toContain("July");
    expect(formatted).toContain("2026");
  });

  it("does not shift a date across a month boundary", () => {
    expect(formatEditionDate("2026-08-01")).toMatch(/^Saturday/);
    expect(formatEditionDate("2026-08-01")).toContain("August");
  });
});

describe("formatEditionInstant", () => {
  it("states the publication time in the editorial zone", () => {
    const formatted = formatEditionInstant("2026-07-21T06:00:00+05:30");

    expect(formatted).toContain("21");
    expect(formatted).toContain("July");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/6:00\s?am/);
    expect(formatted).toContain("IST");
  });

  it("converts an instant given in UTC", () => {
    // 00:30 UTC is 06:00 the same morning in Asia/Kolkata.
    const formatted = formatEditionInstant("2026-07-21T00:30:00Z");

    expect(formatted).toContain("21");
    expect(formatted).toMatch(/6:00\s?am/);
  });

  it("renders editorial midnight as a twelve-hour time", () => {
    const formatted = formatEditionInstant("2026-07-20T18:30:00Z");

    expect(formatted).toMatch(/12:00\s?am/);
    expect(formatted).toContain("21");
  });
});
