// No "use client": the list page, the form pages (server) and the form (client) all use these.

/**
 * The Kontakte list keeps its search, filters and sort in the URL. "Kontakt anlegen" and "Bearbeiten"
 * carry them along as `?liste=<query>` and return to the same list afterwards (UX-038), instead of
 * dropping the search.
 */
const LIST_KEYS = ["q", "art", "buchstabe", "sortierung", "richtung"] as const;

/** The list's own query ("q=koeln&art=authority") from its search params; "" when there is none. */
export function contactListQuery(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): string {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return typeof value === "string" ? value : undefined;
  };
  const out = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const value = get(key)?.slice(0, 100);
    if (value) out.set(key, value);
  }
  return out.toString();
}

/** `?liste=` as received by a form page, cleaned to the list's own keys (never an open redirect). */
export function parseContactListParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? contactListQuery(new URLSearchParams(value)) : "";
}

/** The list with `liste` restored, optionally with a Vorschau open. */
export function contactListHref(liste: string, vorschau?: string): string {
  const params = new URLSearchParams(liste);
  if (vorschau) params.set("vorschau", vorschau);
  const query = params.toString();
  return query ? `/kontakte?${query}` : "/kontakte";
}

/** A form page link ("/kontakte/neu", "/kontakte/<id>/bearbeiten") that remembers the list. */
export function withContactList(path: string, liste: string): string {
  return liste ? `${path}?liste=${encodeURIComponent(liste)}` : path;
}
