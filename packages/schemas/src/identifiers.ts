/**
 * Identifier and text primitives shared across the content contracts.
 *
 * Identifiers are constrained to lowercase kebab-case rather than left as free
 * strings because they appear in URLs, in filenames, and in the cross-reference
 * checks the edition schema runs. A source id that differs from another only by
 * case would satisfy a uniqueness check and then fail to resolve.
 */
import { z } from "zod";

/**
 * Lowercase kebab-case, starting with a letter or digit.
 *
 * Bounded at 64 characters so an identifier cannot become a place to smuggle
 * prose into a field that ends up in a URL.
 */
export const identifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "must be lowercase kebab-case, for example story-rbi-rate-hold",
  );

export type Identifier = z.infer<typeof identifierSchema>;

/**
 * Human-readable text that must actually contain something.
 *
 * Trimmed before the length check so a field of spaces fails rather than
 * rendering as an empty line in a story card.
 */
export function boundedText(min: number, max: number): z.ZodString {
  return z.string().trim().min(min).max(max);
}
