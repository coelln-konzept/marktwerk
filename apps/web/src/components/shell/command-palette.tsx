"use client";

import { Dialog } from "@base-ui/react/dialog";
import { CalendarDays, Contact, MapPin, Search, Store, User, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { type SearchHit, searchEverything } from "@/server/search";
import { useShell } from "./shell-context";

const ICONS = {
  event: CalendarDays,
  venue: MapPin,
  contact: Contact,
  staff: User,
  vendor: Store,
  action: Zap,
} as const;

/** Command palette (Ctrl+K): search across records plus actions; umlaut-insensitive ("koln" finds Köln). */
export function CommandPalette({ actions }: { actions: SearchHit[] }) {
  const t = useTranslations("palette");
  const router = useRouter();
  const { paletteOpen, setPaletteOpen } = useShell();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const listId = useId();

  useEffect(() => {
    if (!paletteOpen) return;
    const q = query.trim();
    const handle = setTimeout(() => {
      startTransition(async () => {
        setHits(q.length < 2 ? [] : await searchEverything(q));
        setActive(0);
      });
    }, 150);
    return () => clearTimeout(handle);
  }, [query, paletteOpen]);

  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ß/g, "ss");
  const matchingActions = actions.filter(
    (a) => !query.trim() || fold(a.title).includes(fold(query.trim())),
  );
  const all = [...hits, ...matchingActions];
  const groups = (["event", "venue", "staff", "contact", "vendor", "action"] as const)
    .map((kind) => ({ kind, items: all.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length > 0);

  function go(hit: SearchHit | undefined) {
    if (!hit) return;
    setPaletteOpen(false);
    setQuery("");
    router.push(hit.href as never);
  }

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Popup className="fixed top-[88px] left-1/2 z-50 flex w-[min(640px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-overlay outline-none">
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <div className="flex items-center gap-3 border-border-subtle border-b px-4 py-3">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <input
              // biome-ignore lint/a11y/noAutofocus: the palette exists to type into
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={all[active] ? `${listId}-${active}` : undefined}
              value={query}
              placeholder={t("placeholder")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, all.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(all[active]);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-base outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <div
            id={listId}
            role="listbox"
            aria-busy={pending}
            className="max-h-[440px] overflow-auto px-2 pt-1 pb-2"
          >
            {groups.length === 0 && (
              <p className="px-2 py-6 text-center text-muted-foreground text-small">
                {query.trim().length < 2 ? t("hint") : pending ? t("searching") : t("empty")}
              </p>
            )}
            {groups.map((group) => (
              // biome-ignore lint/a11y/useSemanticElements: option group inside an ARIA listbox
              <div key={group.kind} role="group" aria-label={t(`groups.${group.kind}`)}>
                <div className="px-2 pt-3 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                  {t(`groups.${group.kind}`)} · {group.items.length}
                </div>
                {group.items.map((hit) => {
                  const index = all.indexOf(hit);
                  const Icon = ICONS[hit.kind];
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox input
                    // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input (aria-activedescendant)
                    <div
                      key={`${hit.kind}-${hit.href}`}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2",
                        index === active && "bg-selected",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-status-neutral-bg text-foreground-2">
                        <Icon aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{hit.title}</span>
                        {hit.subtitle && (
                          <span className="block truncate text-muted-foreground text-tiny">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      {index === active && <Kbd>↵</Kbd>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-border-subtle border-t bg-surface-2 px-4 py-2 text-muted-foreground text-tiny">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("select")}
            </span>
            <span>
              <Kbd>↵</Kbd> {t("open")}
            </span>
            <span className="ml-auto">{t("umlauts")}</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
