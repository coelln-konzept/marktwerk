/**
 * How far the browser history has to go back so the "←" button lands on `targetPath` (UX-065), or
 * null when the history does not lead there (opened in a new tab, arrived with the browser's own
 * Back). Entries of the current page (drawers, tabs, filters on the same path) are skipped: the
 * nearest earlier entry on another path must be the target page. Going back instead of pushing keeps
 * the browser's Back button from looping between the two pages.
 *
 * `urls`: the session history of this tab, oldest first (`navigation.entries()`), `index`: the current
 * entry. Returns a negative delta for `history.go()`.
 */
export function backDelta(
  urls: readonly (string | null)[],
  index: number,
  targetPath: string,
): number | null {
  const path = (url: string | null | undefined) => {
    if (!url) return null;
    try {
      return new URL(url, "http://local").pathname;
    } catch {
      return null;
    }
  };
  const current = path(urls[index]);
  if (current === null) return null;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = path(urls[i]);
    if (earlier === null) return null;
    if (earlier === current) continue;
    return earlier === targetPath ? i - index : null;
  }
  return null;
}
