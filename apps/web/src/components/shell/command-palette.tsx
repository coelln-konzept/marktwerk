"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Contact,
  MapPin,
  Search,
  ShieldCheck,
  Store,
  Truck,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Kbd } from "@/components/ui/kbd";
import { scoreMatch } from "@/lib/search-query";
import { cn } from "@/lib/utils";
import { searchEverything } from "@/server/search";
import type { SearchHit, SearchResult } from "@/server/search-core";
import { useShell } from "./shell-context";

const ICONS = {
  event: CalendarDays,
  task: CircleCheck,
  permit: ShieldCheck,
  payable: Wallet,
  vehicle: Truck,
  venue: MapPin,
  contact: Contact,
  staff: User,
  vendor: Store,
  action: Zap,
} as const;

/** Order of groups that match equally well. */
const GROUP_ORDER = [
  "event",
  "task",
  "permit",
  "payable",
  "vehicle",
  "venue",
  "staff",
  "contact",
  "vendor",
  "action",
] as const;

const NO_RESULT: SearchResult = { hits: [], groups: {} };

/** One row the arrow keys can land on: a hit, or the "Alle N anzeigen" row at the end of a group. */
type Option = { id: string; href: string; hit?: SearchHit; showAll?: number };

type Group = {
  kind: SearchHit["kind"];
  hits: SearchHit[];
  total: number;
  showAllHref?: string;
  options: Option[];
};

/**
 * Command palette (Ctrl+K): search across records plus actions. Every word of the query must match
 * (umlaut-insensitive: "koln" finds Köln), groups are ranked by their best hit, each group says how many
 * records match in total and links to the full list where there is one. A combobox: focus stays in
 * the input, the highlighted row is announced through `aria-activedescendant`.
 */
export function CommandPalette({ actions }: { actions: SearchHit[] }) {
  const t = useTranslations("palette");
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useShell();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>(NO_RESULT);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  // Where focus was before the palette opened; it goes back there on close.
  const openerRef = useRef<HTMLElement | null>(null);
  // Scroll the highlighted row into view only when the arrow keys moved it (not under a resting mouse).
  const scrollToActive = useRef(false);

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      if (target.closest("[data-palette]")) return;
      openerRef.current = target;
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResult(NO_RESULT);
      setFailed(false);
      return;
    }
    let stale = false;
    const handle = setTimeout(() => {
      startTransition(async () => {
        try {
          const next = await searchEverything(q);
          if (stale) return;
          setResult(next);
          setFailed(false);
        } catch {
          // Server unreachable or the action failed: say so here instead of crashing the page.
          if (stale) return;
          setResult(NO_RESULT);
          setFailed(true);
        }
        if (!stale) setActive(0);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
  }, [query, paletteOpen]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim();
    const matchingActions: SearchHit[] = [];
    for (const action of actions) {
      const score = q ? scoreMatch(q, action.title, action.keywords?.join(" ")) : 3;
      if (score !== null) matchingActions.push({ ...action, score });
    }
    const byKind = new Map<SearchHit["kind"], SearchHit[]>();
    for (const hit of [...result.hits, ...matchingActions]) {
      byKind.set(hit.kind, [...(byKind.get(hit.kind) ?? []), hit]);
    }
    const built: Group[] = [];
    for (const kind of GROUP_ORDER) {
      const hits = byKind.get(kind);
      if (!hits?.length) continue;
      const meta = result.groups[kind];
      const total = Math.max(meta?.total ?? hits.length, hits.length);
      built.push({
        kind,
        hits,
        total,
        showAllHref: total > hits.length ? meta?.href : undefined,
        options: [],
      });
    }
    // The group with the best match first; equally good groups keep the fixed order above.
    const best = (g: Group) => Math.min(...g.hits.map((h) => h.score ?? 3));
    built.sort((a, b) => best(a) - best(b));
    let index = 0;
    for (const group of built) {
      group.options = group.hits.map((hit) => ({
        id: `${listId}-${index++}`,
        href: hit.href,
        hit,
      }));
      if (group.showAllHref)
        group.options.push({
          id: `${listId}-${index++}`,
          href: group.showAllHref,
          showAll: group.total,
        });
    }
    return built;
  }, [actions, query, result, listId]);

  const options = groups.flatMap((g) => g.options);
  const current = options[Math.min(active, options.length - 1)];
  const hitCount = groups.reduce((sum, g) => sum + g.hits.length, 0);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    if (current) document.getElementById(current.id)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function close() {
    setPaletteOpen(false);
    setQuery("");
    setResult(NO_RESULT);
    setFailed(false);
    setActive(0);
  }

  function go(option: Option | undefined) {
    if (!option) return;
    close();
    router.push(option.href as never);
  }

  function move(delta: number) {
    if (options.length === 0) return;
    scrollToActive.current = true;
    setActive((i) => (Math.min(i, options.length - 1) + delta + options.length) % options.length);
  }

  // What a screen reader hears when the results change.
  const status = failed
    ? t("error")
    : !searching
      ? ""
      : pending
        ? t("searching")
        : hitCount === 0
          ? t("empty")
          : t("resultsCount", { count: hitCount });

  return (
    <Dialog.Root
      open={paletteOpen}
      onOpenChange={(open) => {
        if (open) setPaletteOpen(true);
        else close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Popup
          data-palette
          // Back to where it was opened from; when that is gone (another page), to the page content.
          finalFocus={() => {
            const opener = openerRef.current;
            return opener?.isConnected ? opener : (document.getElementById("main") ?? true);
          }}
          className="fixed top-[88px] left-1/2 z-50 flex w-[min(640px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-overlay outline-hidden"
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <input
              // biome-ignore lint/a11y/noAutofocus: the palette exists to type into
              autoFocus
              role="combobox"
              aria-label={t("title")}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={current?.id}
              value={query}
              placeholder={t("placeholder")}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(current);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-base outline-hidden"
            />
            <Kbd className="touch:hidden">Esc</Kbd>
          </div>
          <p role="status" aria-live="polite" className="sr-only">
            {status}
          </p>
          {/* A scroll container is a tab stop in some browsers; focus belongs in the input. */}
          <div tabIndex={-1} className="max-h-[440px] overflow-auto px-2 pt-1 pb-2">
            {options.length === 0 && (
              <p aria-hidden className="px-2 py-6 text-center text-muted-foreground text-small">
                {failed
                  ? t("error")
                  : !searching
                    ? t("hint")
                    : pending
                      ? t("searching")
                      : t("empty")}
              </p>
            )}
            {failed && options.length > 0 && (
              <p aria-hidden className="px-2 pt-3 text-small text-status-critical">
                {t("error")}
              </p>
            )}
            <div id={listId} role="listbox" aria-label={t("title")} aria-busy={pending}>
              {groups.map((group) => (
                // biome-ignore lint/a11y/useSemanticElements: option group inside an ARIA listbox
                <div key={group.kind} role="group" aria-label={t(`groups.${group.kind}`)}>
                  <div className="px-2 pt-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                    {t(`groups.${group.kind}`)} ·{" "}
                    {group.total > group.hits.length && !group.showAllHref
                      ? t("shownOf", { shown: group.hits.length, total: group.total })
                      : group.total}
                  </div>
                  {group.options.map((option) => {
                    const hit = option.hit;
                    const Icon = hit ? ICONS[hit.kind] : ArrowRight;
                    const selected = option.id === current?.id;
                    return (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input
                      // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input (aria-activedescendant)
                      <div
                        key={option.id}
                        id={option.id}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActive(options.indexOf(option))}
                        onClick={() => go(option)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                          selected && "bg-selected",
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-lg text-foreground-2",
                            hit ? "bg-status-neutral-bg" : "bg-transparent",
                          )}
                        >
                          <Icon aria-hidden className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate",
                              hit ? "font-medium" : "text-foreground-2",
                            )}
                          >
                            {hit ? hit.title : t("showAll", { count: option.showAll ?? 0 })}
                          </span>
                          {hit?.subtitle && (
                            <span className="block truncate text-muted-foreground text-tiny">
                              {hit.subtitle}
                            </span>
                          )}
                        </span>
                        {selected && <Kbd className="touch:hidden">↵</Kbd>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-border-subtle border-t bg-surface-2 px-4 py-2 text-muted-foreground text-tiny">
            <span className="touch:hidden">
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("select")}
            </span>
            <span className="touch:hidden">
              <Kbd>↵</Kbd> {t("open")}
            </span>
            <span className="ml-auto">{t("umlauts")}</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
