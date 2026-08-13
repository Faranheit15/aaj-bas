import { describe, expect, it } from "vitest";
import { editionDateSchema, timestampSchema } from "./dates";

describe("editionDateSchema", () => {
  it("accepts a calendar day", () => {
    expect(editionDateSchema.safeParse("2026-08-13").success).toBe(true);
  });

  it("rejects days that do not exist", () => {
    // A regex on the shape would let all three through, and the edition would
    // be published under a date no reader can navigate to.
    expect(editionDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(editionDateSchema.safeParse("2026-13-01").success).toBe(false);
    expect(editionDateSchema.safeParse("2025-02-29").success).toBe(false);
  });

  it("accepts a leap day in a leap year", () => {
    expect(editionDateSchema.safeParse("2024-02-29").success).toBe(true);
  });

  it("rejects a timestamp where a calendar day belongs", () => {
    expect(
      editionDateSchema.safeParse("2026-08-13T10:00:00+05:30").success,
    ).toBe(false);
  });

  it("rejects other date orderings", () => {
    expect(editionDateSchema.safeParse("13-08-2026").success).toBe(false);
    expect(editionDateSchema.safeParse("2026/08/13").success).toBe(false);
  });
});

describe("timestampSchema", () => {
  it("accepts an instant with an offset", () => {
    expect(timestampSchema.safeParse("2026-08-13T10:00:00+05:30").success).toBe(
      true,
    );
    expect(timestampSchema.safeParse("2026-08-13T04:30:00Z").success).toBe(
      true,
    );
  });

  it("rejects an instant with no offset", () => {
    // Asia/Kolkata is the editorial timezone, but a stored timestamp that
    // assumes it is ambiguous by five and a half hours -- enough to move an
    // edition across a date boundary.
    expect(timestampSchema.safeParse("2026-08-13T10:00:00").success).toBe(
      false,
    );
  });

  it("rejects a calendar day where an instant belongs", () => {
    expect(timestampSchema.safeParse("2026-08-13").success).toBe(false);
  });
});
