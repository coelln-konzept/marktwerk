/** Lower case without accents, so "koln" finds "Köln" and "ALT" finds "Altstadt". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** What the Bibliothek's market search looks at. */
export type SearchableMarket = {
  name: string;
  code: string | null;
  venueName: string;
  typeNameDe: string;
  typeNameEn: string;
  publicTitle: string | null;
};

/**
 * The markets that match `query` (Einstellungen → Bibliothek): every word must appear in the name,
 * Kürzel, Ort, Art or public title; case and accents don't matter. An empty query keeps all of them.
 */
export function filterMarkets<M extends SearchableMarket>(
  markets: readonly M[],
  query: string | undefined,
): M[] {
  const words = fold(query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [...markets];
  return markets.filter((m) => {
    const haystack = fold(
      [m.name, m.code, m.venueName, m.typeNameDe, m.typeNameEn, m.publicTitle]
        .filter(Boolean)
        .join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
}
