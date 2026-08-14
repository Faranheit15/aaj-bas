/**
 * The editorial calendar, and the only place in the reader that reads a clock.
 *
 * Section 41 makes the edition date a calendar day in a fixed editorial
 * timezone, not a moment and not the device's idea of today. A reader in Los
 * Angeles opening the product at 22:00 on the 20th must be shown the same
 * edition as a reader in Delhi at 10:30 on the 21st, because it is the same
 * edition. Anything here that fell back to the host timezone would hand those
 * two readers different days and look correct on the machine it was written on.
 *
 * Every formatter assembles its output from `formatToParts` rather than
 * trusting a locale's separator order, so the result is a product decision and
 * not an ICU version's. The one thing not taken from ICU is the zone
 * abbreviation: `timeZoneName: "short"` renders Asia/Kolkata as "GMT+5:30" in
 * most builds, so "IST" is appended as a literal.
 */
import type { Timestamp } from "@aaj-bas/schemas";

/** Section 41: the editorial timezone until an approved decision changes it. */
export const EDITORIAL_TIME_ZONE = "Asia/Kolkata";

const LOCALE = "en-GB";

const DAY_PARTS = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EDITORIAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Formatted in UTC on purpose. An edition date is a calendar day with no
 * instant attached, so it is anchored at UTC midnight and read back in UTC;
 * reading it back in the editorial timezone would shift it forward a day.
 */
const EDITION_DATE_PARTS = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const INSTANT_PARTS = new Intl.DateTimeFormat(LOCALE, {
  timeZone: EDITORIAL_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  // Stated explicitly because a build defaulting to h11 renders midnight as
  // "0:00 am", which reads as a data error rather than as a time.
  hourCycle: "h12",
});

/**
 * The editorial calendar day containing `instant`, as `YYYY-MM-DD`.
 *
 * This is the only clock read in the reader, and it is passed an instant rather
 * than calling `new Date()` itself so that callers stay testable without fake
 * timers.
 */
export function editorialDay(instant: Date): string {
  const parts = DAY_PARTS.formatToParts(instant);

  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

/** An edition date as "Tuesday, 21 July 2026". Expects a validated date. */
export function formatEditionDate(date: string): string {
  const parts = EDITION_DATE_PARTS.formatToParts(atUtcMidnight(date));

  return `${partValue(parts, "weekday")}, ${partValue(parts, "day")} ${partValue(parts, "month")} ${partValue(parts, "year")}`;
}

/**
 * A timestamp as "21 July 2026, 6:00 am IST", in the editorial timezone.
 *
 * Showing the zone matters: a publication time without one is the ambiguity
 * section 41 exists to remove, and a reader checking whether an edition is
 * today's has no way to tell otherwise.
 */
export function formatEditionInstant(timestamp: Timestamp): string {
  const parts = INSTANT_PARTS.formatToParts(new Date(timestamp));
  const dayPeriod = partValue(parts, "dayPeriod").toLowerCase();

  return `${partValue(parts, "day")} ${partValue(parts, "month")} ${partValue(parts, "year")}, ${partValue(parts, "hour")}:${partValue(parts, "minute")} ${dayPeriod} IST`;
}

/** `YYYY-MM-DD` anchored at UTC midnight, matching EDITION_DATE_PARTS. */
function atUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function partValue(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}
