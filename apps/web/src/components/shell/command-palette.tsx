"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  CircleCheck,
  Contact,
  LoaderCircle,
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
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, useTransition } from "react";
import { TaskStatusBadge } from "@/components/board/task-bits";
import { EventStatusBadge } from "@/components/events/event-status";
import { PermitStateBadge } from "@/components/permits/permit-state-badge";
import { Kbd } from "@/components/ui/kbd";
import { scoreMatch } from "@/lib/search-query";
import { cn } from "@/lib/utils";
import { searchEverything } from "@/server/search";
import type {
  SearchFallback,
  SearchGroup,
  SearchHit,
  SearchResult,
  SearchStatus,
} from "@/server/search-core";
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

/** Icons of the lists offered when nothing matches. */
const FALLBACK_ICONS: Record<SearchFallback["kind"], typeof Archive> = {
  event: CalendarDays,
  venue: MapPin,
  contact: Contact,
  vendor: Store,
  archive: Archive,
};

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

/**
 * One row the arrow keys can land on: a hit, the "anzeigen" row at the end of a group (`showAll`), or a
 * list offered when nothing matches (`fallback`).
 */
type Option = {
  id: string;
  href: string;
  hit?: SearchHit;
  showAll?: SearchGroup;
  fallback?: SearchFallback["kind"];
};

type Group = {
  kind: SearchHit["kind"];
  hits: SearchHit[];
  total: number;
  showAll?: SearchGroup;
  options: Option[];
};

/** The server's answer and the query it belongs to: rows of an older query are stale. */
type Answer = { query: string; result: SearchResult; failed: boolean };

const NO_ANSWER: Answer = { query: "", result: NO_RESULT, failed: false };

/** A hit's state as colour + icon + text. */
function HitStatus({ status }: { status: SearchStatus }) {
  switch (status.kind) {
    case "event":
      return <EventStatusBadge status={status.key} />;
    case "task":
      return <TaskStatusBadge status={status.key} />;
    case "permit":
      return <PermitStateBadge state={status.key} />;
  }
}

/**
 * Command palette (Ctrl+K): search across records plus actions. Every word of the query must match
 * (spelling-insensitive: "koln" and "koeln" find Köln), groups are ranked by their best hit, each group says how
 * many records match in total and links to the full list where there is one, saying how many rows that list
 * shows. A combobox: focus stays in the input, the highlighted row is announced through `aria-activedescendant`.
 *
 * While the shown rows belong to an older query (debounce plus the server round trip) they are dimmed and a
 * spinner turns; Enter waits for the current results instead of opening a stale first row.
 */
export function CommandPalette({ actions }: { actions: SearchHit[] }) {
  const t = useTranslations("palette");
  const tTasks = useTranslations("tasks");
  const tEvents = useTranslations("events");
  // A season task names its market and season where an event task names its event (research 13 §6.3);
  // a permit names its season, so the same permit of two years differs.
  const subtitleOf = (hit: SearchHit) =>
    [
      hit.subtitle,
      hit.season
        ? tTasks("seasonContext", { name: hit.season.name, year: String(hit.season.year) })
        : null,
      hit.seasonYear != null ? tEvents("seasonOption", { season: String(hit.seasonYear) }) : null,
    ]
      .filter(Boolean)
      .join(hit.kind === "permit" ? " · " : " › ");
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useShell();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer>(NO_ANSWER);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const listId = useId();
  // Where focus was before the palette opened; it goes back there on close.
  const openerRef = useRef<HTMLElement | null>(null);
  // Scroll the highlighted row into view only when the arrow keys moved it (not under a resting mouse).
  const scrollToActive = useRef(false);
  // Enter pressed while the rows were stale: run it once the current query's results are in.
  const enterQueued = useRef(false);

  const trimmed = query.trim();
  const searching = trimmed.length >= 2;
  // The rows match what is typed (or nothing needs the server).
  const settled = !searching || answer.query === trimmed;
  const result = searching ? answer.result : NO_RESULT;
  const failed = searching && answer.failed;

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
    if (q.length < 2) return;
    let stale = false;
    const handle = setTimeout(() => {
      startTransition(async () => {
        let next: Answer;
        try {
          next = { query: q, result: await searchEverything(q), failed: false };
        } catch {
          // Server unreachable or the action failed: say so here instead of crashing the page.
          next = { query: q, result: NO_RESULT, failed: true };
        }
        if (stale) return;
        setAnswer(next);
        setActive(0);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
  }, [query, paletteOpen]);

  const groups = useMemo<Group[]>(() => {
    const matchingActions: SearchHit[] = [];
    for (const action of actions) {
      const score = trimmed ? scoreMatch(trimmed, action.title, action.keywords?.join(" ")) : 3;
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
      // The link only where the list shows something (`listed` counts its rows; missing = not counted).
      const linked = meta?.href && total > hits.length && (meta.listed ?? total) > 0;
      built.push({
        kind,
        hits,
        total,
        showAll: linked ? { ...meta, total } : undefined,
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
      if (group.showAll?.href)
        group.options.push({
          id: `${listId}-${index++}`,
          href: group.showAll.href,
          showAll: group.showAll,
        });
    }
    return built;
  }, [actions, trimmed, result, listId]);

  const hitCount = groups.reduce((sum, g) => sum + g.hits.length, 0);
  // Nothing matches: the lists to look further in, as rows the arrow keys reach.
  const empty = searching && settled && !failed && hitCount === 0;
  const fallbackOptions: Option[] = empty
    ? (result.fallbacks ?? []).map((f) => ({
        id: `${listId}-fallback-${f.kind}`,
        href: f.href,
        fallback: f.kind,
      }))
    : [];
  const options = [...groups.flatMap((g) => g.options), ...fallbackOptions];
  const current = options[Math.min(active, options.length - 1)];

  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    if (current) document.getElementById(current.id)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function close() {
    setPaletteOpen(false);
    setQuery("");
    setAnswer(NO_ANSWER);
    setActive(0);
    enterQueued.current = false;
  }

  function go(option: Option | undefined) {
    if (!option) return;
    close();
    router.push(option.href as never);
  }

  // The queued Enter: open the highlighted row of the current results (the first, unless the arrow
  // keys moved since); a failed search opens nothing.
  const runQueuedEnter = useEffectEvent(() => {
    if (!enterQueued.current || !settled) return;
    enterQueued.current = false;
    if (!failed && current && !current.fallback) go(current);
  });
  useEffect(() => {
    if (settled) runQueuedEnter();
  }, [settled]);

  function move(delta: number) {
    if (options.length === 0) return;
    scrollToActive.current = true;
    setActive((i) => (Math.min(i, options.length - 1) + delta + options.length) % options.length);
  }

  function showAllLabel(group: SearchGroup) {
    const listed = group.listed;
    if (listed === undefined || listed === group.total) return t("showAll", { count: group.total });
    return group.upcoming
      ? t("showUpcoming", { count: listed })
      : t("showListed", { count: listed });
  }

  function optionLabel(option: Option) {
    if (option.hit) return option.hit.title;
    if (option.fallback) return t(`fallbacks.${option.fallback}`);
    return option.showAll ? showAllLabel(option.showAll) : "";
  }

  // What a screen reader hears when the results change.
  const status = failed
    ? t("error")
    : !searching
      ? ""
      : !settled
        ? t("searching")
        : hitCount === 0
          ? t("emptyFor", { query: trimmed })
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
            {settled ? (
              <Search aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <LoaderCircle
                aria-hidden
                className="size-4 text-muted-foreground motion-safe:animate-spin"
              />
            )}
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
                enterQueued.current = false;
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
                  // The rows belong to an older query: wait for the current ones.
                  if (settled) go(current);
                  else enterQueued.current = true;
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
            {hitCount === 0 && !empty && (
              <p aria-hidden className="px-2 py-6 text-center text-muted-foreground text-small">
                {failed ? t("error") : !searching ? t("hint") : t("searching")}
              </p>
            )}
            {empty && (
              <div aria-hidden className="px-2 pt-5 pb-2 text-center">
                <p className="font-medium text-small">{t("emptyFor", { query: trimmed })}</p>
                <p className="mx-auto mt-1 max-w-[46ch] text-muted-foreground text-tiny">
                  {t("emptyHint")}
                </p>
              </div>
            )}
            {failed && hitCount > 0 && (
              <p aria-hidden className="px-2 pt-3 text-small text-status-critical">
                {t("error")}
              </p>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={t("title")}
              aria-busy={!settled}
              // Stale rows (an older query's) stay readable but step back until the current ones arrive.
              className={cn("transition-opacity", !settled && "opacity-55")}
            >
              {groups.map((group) => (
                // biome-ignore lint/a11y/useSemanticElements: option group inside an ARIA listbox
                <div key={group.kind} role="group" aria-label={t(`groups.${group.kind}`)}>
                  <div className="px-2 pt-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                    {t(`groups.${group.kind}`)} ·{" "}
                    {group.total > group.hits.length && !group.showAll
                      ? t("shownOf", { shown: group.hits.length, total: group.total })
                      : group.total}
                  </div>
                  {group.options.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      label={optionLabel(option)}
                      subtitle={option.hit ? subtitleOf(option.hit) : ""}
                      selected={option.id === current?.id}
                      onHover={() => setActive(options.indexOf(option))}
                      onPick={() => go(option)}
                    />
                  ))}
                </div>
              ))}
              {fallbackOptions.length > 0 && (
                // biome-ignore lint/a11y/useSemanticElements: option group inside an ARIA listbox
                <div role="group" aria-label={t("fallbackGroup")}>
                  <div className="px-2 pt-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                    {t("fallbackGroup")}
                  </div>
                  {fallbackOptions.map((option) => (
                    <OptionRow
                      key={option.id}
                      option={option}
                      label={optionLabel(option)}
                      subtitle=""
                      selected={option.id === current?.id}
                      onHover={() => setActive(options.indexOf(option))}
                      onPick={() => go(option)}
                    />
                  ))}
                </div>
              )}
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

/** One row of the listbox: icon, title, subtitle and the record's state; the "anzeigen" and list rows are plain. */
function OptionRow({
  option,
  label,
  subtitle,
  selected,
  onHover,
  onPick,
}: {
  option: Option;
  label: string;
  subtitle: string;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const hit = option.hit;
  const Icon = hit
    ? ICONS[hit.kind]
    : option.fallback
      ? FALLBACK_ICONS[option.fallback]
      : ArrowRight;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input
    // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input (aria-activedescendant)
    <div
      id={option.id}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
        selected && "bg-selected",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg text-foreground-2",
          hit || option.fallback ? "bg-status-neutral-bg" : "bg-transparent",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            hit ? "font-medium" : !option.fallback && "text-foreground-2",
          )}
        >
          {label}
        </span>
        {subtitle && (
          // Two lines on narrow screens, so the season at the end stays readable.
          <span className="line-clamp-2 text-muted-foreground text-tiny sm:line-clamp-1">
            {subtitle}
          </span>
        )}
      </span>
      {hit?.status && (
        <span className="shrink-0">
          <HitStatus status={hit.status} />
        </span>
      )}
      {selected && <Kbd className="touch:hidden">↵</Kbd>}
    </div>
  );
}
