/**
 * A pointer to reporting the product did not write.
 *
 * The product stores metadata and a link, never article bodies or publisher
 * imagery — section 18 treats source material as both untrusted and somebody
 * else's property. `title` is the source's own headline, kept so a reader can
 * recognise the article they are about to open; it is not summary text.
 *
 * The URL is restricted to http and https. A source registry that could carry
 * `file:` or a private-network address would become the first half of the SSRF
 * problem section 19 exists to prevent, and the fetcher is not the only place
 * that has to hold that line.
 */
import { z } from "zod";
import { timestampSchema } from "./dates";
import { boundedText, identifierSchema } from "./identifiers";

/** What kind of thing is being cited, from PRD section 13.3. */
export const SOURCE_TYPES = [
  "publisher",
  "primary",
  "research",
  "official",
] as const;

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof sourceTypeSchema>;

/**
 * An absolute http(s) URL.
 *
 * The protocol check is a `refine` rather than a regex so the parse still uses
 * the platform URL parser, which rejects the malformed input a pattern would
 * happily match.
 */
export const sourceUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "must be an http or https URL" },
  );

export const sourceReferenceSchema = z.object({
  id: identifierSchema,
  publisher: boundedText(1, 120),
  title: boundedText(1, 300),
  url: sourceUrlSchema,
  sourceType: sourceTypeSchema,
  publishedAt: timestampSchema,
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;
