/** Controls inside a clickable row that do their own thing (same list as `ui/keyboard-rows`). */
const INTERACTIVE =
  "button, input, select, textarea, label, summary, [role=button], [role=checkbox], [role=menuitem], [data-no-row-click]";

/**
 * The in-app page a plain left click on `target` is about to open: a same-origin link, or a row with
 * `data-href` (opened by `KeyboardRows`). Null for anything else: new tabs, downloads, other sites,
 * links to the URL already shown (only the #hash differs) and clicks a row ignores.
 */
export function navTarget(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  let href: string | null = null;
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (link) {
    if (link.hasAttribute("download") || (link.target && link.target !== "_self")) return null;
    href = link.href;
  } else {
    const row = target.closest<HTMLElement>("[data-href]");
    if (!row || target.closest(INTERACTIVE) || window.getSelection()?.toString()) return null;
    href = row.dataset.href ?? null;
  }
  if (!href) return null;
  const url = new URL(href, window.location.href);
  const here = window.location;
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}
