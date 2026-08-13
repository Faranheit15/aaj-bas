/**
 * JSON Schema export of the edition contract.
 *
 * Generated from the Zod schema rather than hand-maintained, so the two cannot
 * drift. It exists for consumers that are not TypeScript — a future content
 * pipeline step, an editor validating a draft, or anyone auditing the contract
 * without reading this package.
 *
 * It is the *shape* contract and nothing more. JSON Schema cannot express the
 * cross-field rules in `edition.ts` — that a story's sources resolve, that the
 * core holds exactly eight stories, that a pooled story matches its interest —
 * so those are silently absent from the output. Anything validating only
 * against this will accept editions the product must reject, which is why
 * `editionSchema` stays the authority and this is a description of it.
 */
import { z } from "zod";
import { editionSchema } from "./edition";

/** The edition contract as a JSON Schema document. */
export function editionJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(editionSchema, { io: "input" });
}
