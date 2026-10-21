/**
 * @marktwerk/synthetic: deterministic development data for the internal ops platform.
 * Usage: `generateDataset()` returns the whole dataset in memory. `pnpm generate` writes it to out/.
 */

export {
  COMPANY_NAME,
  MAX_EVENTS_PER_WEEKEND,
  REFERENCE_DATE,
  SEASONS,
  SEED,
  TIME_ZONE,
} from "./constants";
export { type GenerateOptions, generateDataset } from "./dataset";
export { EXAMPLE_DOMAINS, FICTION_PHONE_PATTERN } from "./lib/fiction";
export { buildManifest } from "./manifest";
export type * from "./types";
