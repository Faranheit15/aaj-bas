/**
 * Service worker: what a build installs against losing the network.
 *
 * The third decision of the same kind as `content-staging`'s two. `planStaging`
 * answers what a build carries, `planRemoval` what it must stop carrying, and
 * `planPrecache` what it must survive without. All three are values in, values
 * out, so `scripts/build-service-worker.ts` discovers files and writes one, and
 * decides nothing -- exactly as `scripts/stage-content.ts` does.
 */
export type { PrecachePlan } from "./precache";
export { buildIdFor, planPrecache } from "./precache";
