/**
 * The in-app target of a click on `anchor`, or null when the click should go ahead as usual: a new tab or
 * window (modifier keys, `target`), a download, another site (the browser's own beforeunload prompt covers
 * that) or a link to the page itself (e.g. `#anchor`).
 */
export function guardedTarget(
  anchor: { href: string; target: string; hasAttribute(name: string): boolean },
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  here: { origin: string; pathname: string; search: string },
): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, `${here.origin}${here.pathname}${here.search}`);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
