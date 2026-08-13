/**
 * Date and timestamp contracts.
 *
 * Section 41 requires edition-date semantics to stay separate from timestamp
 * semantics, so they are two types rather than one string. An edition date is a
 * calendar day in the editorial timezone (Asia/Kolkata); a timestamp is an exact
 * instant. Conflating them is how an edition ends up published on the wrong day
 * for readers whose device clock sits on the other side of midnight.
 *
 * `z.iso.date()` validates the calendar, not just the shape: 2026-02-30 and
 * 2025-02-29 are rejected while 2024-02-29 is accepted. `z.iso.datetime()` is
 * given `offset: true` so a naive local timestamp cannot be serialised — an
 * instant without an offset is ambiguous by exactly the amount that matters.
 */
import { z } from "zod";

/**
 * A calendar day in the editorial timezone, `YYYY-MM-DD`.
 *
 * This is the edition's identity, not a moment. It carries no time and no zone;
 * the zone is an editorial rule recorded in section 41, not per-edition data.
 */
export const editionDateSchema = z.iso.date();
export type EditionDate = z.infer<typeof editionDateSchema>;

/** An exact instant, ISO 8601 with a required UTC offset. */
export const timestampSchema = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof timestampSchema>;
