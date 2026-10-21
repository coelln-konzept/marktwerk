import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED } from "./constants";
import { generateDataset } from "./dataset";
import { buildManifest } from "./manifest";

/** Writes one JSON file per entity plus manifest.json into packages/synthetic/out/ (gitignored). */
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "out");

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main(): void {
  const dataset = generateDataset({ seed: SEED });
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const [key, value] of Object.entries(dataset)) {
    writeJson(join(outDir, `${key}.json`), value);
  }
  const manifest = buildManifest(dataset, SEED);
  writeJson(join(outDir, "manifest.json"), manifest);

  const total = Object.values(manifest.counts).reduce((sum, count) => sum + count, 0);
  console.log(`Wrote ${Object.keys(dataset).length} entity files (${total} records) to ${outDir}`);
}

main();
