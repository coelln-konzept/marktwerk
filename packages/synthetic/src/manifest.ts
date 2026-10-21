import { COMPANY_NAME, GENERATOR_NAME, REFERENCE_DATE } from "./constants";
import type { Dataset, DatasetEntityKey, Manifest } from "./types";

/** Counts per entity (settings counts as 1). The generate script writes this as out/manifest.json. */
export function buildManifest(dataset: Dataset, seed: number): Manifest {
  const counts = {} as Record<DatasetEntityKey, number>;
  for (const key of Object.keys(dataset) as DatasetEntityKey[]) {
    const value = dataset[key];
    counts[key] = Array.isArray(value) ? value.length : 1;
  }
  return {
    generator: GENERATOR_NAME,
    seed,
    referenceDate: REFERENCE_DATE,
    companyName: COMPANY_NAME,
    counts,
  };
}
