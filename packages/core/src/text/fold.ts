/*
 * Umlaut-insensitive search. "Köln" must be found by "koeln", "koln" and "Köln"; "Straße" by "strasse".
 * Both the haystack and the needle are reduced to lower case, and a text matches when any needle form
 * occurs in any haystack form: forms are the plain fold (ö → o) and the German transliteration (ö → oe).
 */

function fold(text: string, transliterate: boolean): string {
  let value = text.toLowerCase().replaceAll("ß", "ss");
  if (transliterate)
    value = value.replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue");
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** The comparable forms of a text. */
export function foldForms(text: string): [string, string] {
  return [fold(text, false), fold(text, true)];
}

/** True if `needle` occurs in any of the haystacks, ignoring case and umlauts. An empty needle matches. */
export function foldIncludes(haystacks: (string | null | undefined)[], needle: string): boolean {
  const wanted = foldForms(needle.trim());
  if (wanted[0] === "") return true;
  return haystacks.some((h) => {
    if (!h) return false;
    const forms = foldForms(h);
    return wanted.some((w) => forms.some((f) => f.includes(w)));
  });
}
