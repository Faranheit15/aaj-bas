/**
 * Content staging: which validated editions a build carries.
 *
 * A build makes two decisions -- what it carries, and what it must stop
 * carrying -- and afterwards there is one thing worth checking. `planStaging`
 * takes the report `validateEditions` already produced and turns it into a plan
 * a script can execute without making any further judgement: the script copies
 * the files the plan names and writes the index the plan built. `planRemoval`
 * answers, for the same run, which already-staged files have to go first. And
 * `validateStagedIndex` reads back the pointer that was written, because it is
 * the one document every reader loads and nothing else looks at it again.
 *
 * All three are values in, values out. Splitting them from the filesystem is
 * what keeps "may this edition be deployed", "may this file be deleted", and
 * "could a reader read this pointer" answerable in a test rather than only
 * observable in a build.
 */
export type {
  SkippedEdition,
  StagedEdition,
  StagingMode,
  StagingPlan,
} from "./plan";
export { planStaging } from "./plan";
export type { StagingRemoval } from "./removal";
export { planRemoval } from "./removal";
export type { StagedIndexValidation } from "./staged-index";
export { validateStagedIndex } from "./staged-index";
