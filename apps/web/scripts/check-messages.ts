/**
 * Fails if a message key exists in one locale but not the other, or if two areas define the same
 * top-level namespace (CLAUDE.md: every UI string in both de and en).
 */
import { readFileSync } from "node:fs";
import { MESSAGE_AREAS } from "../src/i18n/messages";

function keys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const load = (locale: string, area: string) =>
  JSON.parse(
    readFileSync(new URL(`../messages/${locale}/${area}.json`, import.meta.url), "utf8"),
  ) as object;

const problems: string[] = [];
const owner = new Map<string, string>();
for (const area of MESSAGE_AREAS) {
  const de = load("de", area);
  const en = load("en", area);
  const deKeys = new Set(keys(de).filter(Boolean));
  const enKeys = new Set(keys(en).filter(Boolean));
  for (const k of deKeys) if (!enKeys.has(k)) problems.push(`${area}: "${k}" missing in en`);
  for (const k of enKeys) if (!deKeys.has(k)) problems.push(`${area}: "${k}" missing in de`);
  for (const ns of Object.keys(de)) {
    const other = owner.get(ns);
    if (other) problems.push(`namespace "${ns}" defined in both ${other} and ${area}`);
    owner.set(ns, area);
  }
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`✓ messages: ${MESSAGE_AREAS.length} areas, de and en in sync`);
