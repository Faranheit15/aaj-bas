/**
 * Reading back the pointer a build wrote, to check the reader could read it.
 *
 * `planStaging` produces an index and `scripts/stage-content.ts` serialises it,
 * and between the two there is a file on disk that nothing looks at again. That
 * file is the first request every reader makes: if it is corrupt, the failure
 * is not one edition but the whole product, on every route, showing "We could
 * not display this edition." to everybody. The staged editions are re-checked
 * before a deploy for exactly that reason; this makes the same check possible
 * for the document that points at them.
 *
 * It reads text rather than a path, so the decision stays a value: the schema
 * is authoritative (section 16), and the answer to "would the reader accept
 * this document" should be assertable without writing a file.
 *
 * The published contract is the only judge here. Deliberately: a second,
 * hand-written idea of what an index may contain would be a quieter copy of
 * `editionIndexSchema` that could disagree with the reader's copy, and the
 * disagreement would surface as a green build serving a page nobody can read.
 */
import { type EditionIndex, editionIndexSchema } from "@aaj-bas/schemas";

export type StagedIndexValidation =
  | { readonly ok: true; readonly index: EditionIndex }
  | {
      /**
       * Why the reader would refuse it, one line each, ready to print.
       *
       * Locations and reasons, never the document: an index carries dates and
       * enumerations, but a validator that echoed its input would be the wrong
       * habit to establish in a pipeline that also handles news text (section
       * 38).
       */
      readonly ok: false;
      readonly problems: readonly string[];
    };

export function validateStagedIndex(text: string): StagedIndexValidation {
  let document: unknown;

  try {
    document = JSON.parse(text) as unknown;
  } catch (error) {
    // Distinguished from a schema failure because they are different repairs:
    // this one is a truncated or half-written file, not a wrong field.
    return {
      ok: false,
      problems: [
        `the file is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  const parsed = editionIndexSchema.safeParse(document);

  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) =>
          `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, index: parsed.data };
}
