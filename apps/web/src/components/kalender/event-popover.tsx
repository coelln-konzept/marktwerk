"use client";

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import type { EventStatus } from "@marktwerk/core/events/lifecycle";
import { ArrowRight, ChevronDown, ListChecks, OctagonAlert, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStatusChange } from "@/components/event-detail/status-menu";
import { EventStatusBadge } from "@/components/events/event-status";
import { EventTypeTag } from "@/components/ui/event-type-tag";
import { formatDateWithWeekday, formatWeek } from "@/lib/format";
import { EVENT_STATUS } from "@/lib/status";
import { EVENT_VORSCHAU_PREFIX, type EventPreview, eventVorschauValue } from "./event-params";

/**
 * Kalender event popover (UT2-08, decision D2-8): one popover for every event chip (Monat) and event row
 * (Liste). The chips and the rows' names stay real links to the event, so Ctrl/⌘-click, middle-click and
 * "open in new tab" still go to the event page; a plain click opens the popover in place.
 */
export const eventPopover = Popover.createHandle<string>();

/** Statuses the popover offers (no Verschieben, no Absagen: those stay on the event page). */
const POPOVER_STATUSES: readonly EventStatus[] = ["draft", "planned", "confirmed"];

/** Elements inside a list row that do their own thing; a click on them never opens the popover. */
const INTERACTIVE =
  "a, button, input, select, textarea, label, summary, [role=button], [role=menuitem]";

/**
 * A chip or a row name that opens the popover. Renders a link to the event page: a plain click opens the
 * popover, a modified click (new tab/window) is left to the browser.
 */
export function EventPopoverTrigger({
  eventId,
  href,
  title,
  className,
  tabIndex,
  children,
}: {
  eventId: string;
  /** The event page, for middle-click and "open in new tab". */
  href: string;
  title?: string;
  className?: string;
  tabIndex?: number;
  children: React.ReactNode;
}) {
  return (
    <Popover.Trigger
      handle={eventPopover}
      payload={eventId}
      nativeButton={false}
      render={<a href={href} />}
      data-event-trigger={eventId}
      title={title}
      tabIndex={tabIndex}
      className={className}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          // New tab / window: the browser follows the link, the popover stays shut.
          event.preventBaseUIHandler();
          return;
        }
        event.preventDefault();
      }}
    >
      {children}
    </Popover.Trigger>
  );
}

/**
 * For other popovers around the chips ("+ N weitere"): true when a close request comes from the event
 * popover or its status menu, so the day popover stays open underneath (its chip anchors the event popover).
 */
export function fromEventPopover(details: { reason: string; event: Event }): boolean {
  const node =
    details.reason === "focus-out"
      ? (details.event as FocusEvent).relatedTarget
      : details.event?.target;
  return node instanceof Element && node.closest("[data-event-popover]") !== null;
}

/** Writes (or drops) `vorschau=veranstaltung:<id>` without a navigation, only while on the Kalender. */
function replaceVorschau(path: string, value: string | null) {
  const url = new URL(window.location.href);
  if (url.pathname !== path) return;
  const current = url.searchParams.get("vorschau");
  if (value === null) {
    if (!current?.startsWith(EVENT_VORSCHAU_PREFIX)) return;
    url.searchParams.delete("vorschau");
  } else {
    if (current === value) return;
    url.searchParams.set("vorschau", value);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Holds the popover for the chips and rows inside it. Liste rows (`data-event-row`) open it on a click
 * anywhere in the row and on Enter/Space; focus goes back to the row. `vorschauId` (from
 * `?vorschau=veranstaltung:<id>`) opens it at the event's first chip; when the event has no chip on the
 * screen (another month, a hidden layer, inside "+ N weitere"), `fallback` (the Vorschau card) shows instead.
 */
export function EventPopoverProvider({
  path,
  events,
  vorschauId,
  canWrite,
  canTasks,
  fallback,
  children,
}: {
  path: string;
  events: EventPreview[];
  vorschauId: string | null;
  /** Status menu (event:write). */
  canWrite: boolean;
  /** "Checkliste" link with the task counts (task:read). */
  canTasks: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  /** Where focus goes when the popover closes: the list row it came from, else its trigger. */
  const returnTo = useRef<HTMLElement | null>(null);
  const openRef = useRef<HTMLAnchorElement>(null);
  const [showFallback, setShowFallback] = useState(false);

  // A linked popover: open it at the event's first visible chip, or show the Vorschau card.
  useEffect(() => {
    if (!vorschauId) {
      setShowFallback(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (eventPopover.isOpen) return;
      const trigger = [
        ...document.querySelectorAll<HTMLElement>(
          `[data-event-trigger="${CSS.escape(vorschauId)}"]`,
        ),
      ].find((el) => el.getClientRects().length > 0);
      if (trigger?.id) {
        setShowFallback(false);
        returnTo.current = trigger.closest<HTMLElement>("[data-event-row]");
        eventPopover.open(trigger.id);
      } else setShowFallback(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [vorschauId]);

  // After a new render (another month, other layers, a status change) the open chip may be gone: close.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (eventPopover.isOpen && !document.querySelector("[data-event-trigger][data-popup-open]"))
        eventPopover.close();
    });
    return () => cancelAnimationFrame(frame);
  });

  function openFromRow(row: HTMLElement) {
    const trigger = row.querySelector<HTMLElement>("[data-event-trigger]");
    if (!trigger?.id) return false;
    returnTo.current = row;
    eventPopover.open(trigger.id);
    return true;
  }

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-event-row]");
    if (!row || !event.currentTarget.contains(row)) return;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey) {
      const href = row.querySelector<HTMLAnchorElement>("[data-event-trigger]")?.href;
      if (href) window.open(href, "_blank", "noopener");
      return;
    }
    openFromRow(row);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target as HTMLElement;
    if (!target.matches("[data-event-row]")) return;
    if (openFromRow(target)) event.preventDefault();
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegates click and key handling for the Liste rows inside */}
      <div className="contents" onClick={onClick} onKeyDown={onKeyDown}>
        {children}
      </div>
      <Popover.Root
        handle={eventPopover}
        onOpenChange={(open, details) => {
          if (open) {
            setShowFallback(false); // a linked Vorschau card gives way to the popover
            if (details.reason === "trigger-press")
              returnTo.current = details.trigger?.closest<HTMLElement>("[data-event-row]") ?? null;
          } else replaceVorschau(path, null);
        }}
      >
        {({ payload }) => {
          const preview = payload ? byId.get(payload) : undefined;
          return (
            <Popover.Portal>
              <Popover.Positioner
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={12}
                className="z-50"
              >
                <Popover.Popup
                  data-event-popover
                  initialFocus={openRef}
                  finalFocus={() => {
                    const target = returnTo.current;
                    returnTo.current = null;
                    return target?.isConnected ? target : true;
                  }}
                  className="flex max-h-[min(480px,75vh)] w-[min(340px,calc(100vw-24px))] flex-col gap-3 overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-pop outline-hidden"
                >
                  {preview && (
                    <EventPopoverBody
                      key={preview.id}
                      preview={preview}
                      path={path}
                      canWrite={canWrite}
                      canTasks={canTasks}
                      openRef={openRef}
                    />
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          );
        }}
      </Popover.Root>
      {showFallback && fallback}
    </>
  );
}

/** "08–16" for full hours, else "08:30–16:00". */
function hourRange(open: string, close: string) {
  const full = (time: string) => time.endsWith(":00");
  return full(open) && full(close)
    ? { open: open.slice(0, 2), close: close.slice(0, 2) }
    : { open, close };
}

function EventPopoverBody({
  preview,
  path,
  canWrite,
  canTasks,
  openRef,
}: {
  preview: EventPreview;
  path: string;
  canWrite: boolean;
  canTasks: boolean;
  openRef: React.RefObject<HTMLAnchorElement | null>;
}) {
  const t = useTranslations("kalenderPage.eventPopover");
  const tStatus = useTranslations("status.event");
  const locale = useLocale();
  const change = useStatusChange({
    eventId: preview.id,
    eventName: preview.name,
    status: preview.status,
  });
  const targets = canWrite ? change.targets.filter((to) => POPOVER_STATUSES.includes(to)) : [];

  // The open popover is linkable: `?vorschau=veranstaltung:<id>` (replaced, no history entry).
  useEffect(() => {
    replaceVorschau(path, eventVorschauValue(preview.id));
  }, [path, preview.id]);

  const { startsOn, endsOn, times, tasks } = preview;
  const date = `${formatDateWithWeekday(startsOn, locale)}${endsOn !== startsOn ? ` – ${formatDateWithWeekday(endsOn, locale)}` : ""} · ${formatWeek(startsOn, locale)}`;
  const facts = [
    { label: t("date"), value: date },
    {
      label: t("times"),
      value: t("timesValue", { ...hourRange(times.open, times.close), setup: times.setup }),
    },
    { label: t("venue"), value: preview.venueName },
  ];
  const eventHref = `/veranstaltungen/${preview.id}`;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventTypeTag typeKey={preview.typeKey}>{preview.typeName}</EventTypeTag>
          <EventStatusBadge status={preview.status} />
        </div>
        <Popover.Close
          aria-label={t("close")}
          className="-mt-1 -mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X aria-hidden className="size-4" />
        </Popover.Close>
      </div>
      <Popover.Title className="m-0 font-semibold text-[15px] leading-snug">
        {preview.name}
      </Popover.Title>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-small">
        {facts.map((fact) => (
          <div key={fact.label} className="contents">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="tabular m-0">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {canTasks && (
        <Link
          href={`${eventHref}/board` as never}
          className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border-subtle px-2 py-1 text-small hover:bg-hover"
        >
          <ListChecks aria-hidden className="size-4 shrink-0 text-foreground-2" />
          <span className="font-medium">{t("checklist")}</span>
          <span className="text-muted-foreground">{t("openTasks", { count: tasks.open })}</span>
          {tasks.overdue > 0 && (
            <span className="inline-flex items-center gap-1 font-medium text-status-critical">
              <OctagonAlert aria-hidden className="size-3.5" />
              {t("overdueTasks", { count: tasks.overdue })}
            </span>
          )}
          <ArrowRight aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
        </Link>
      )}
      <div className="flex items-center justify-between gap-2 border-border-subtle border-t pt-3">
        {targets.length > 0 ? (
          <Menu.Root>
            <Menu.Trigger
              aria-busy={change.pending || undefined}
              disabled={change.pending}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-80 data-[popup-open]:bg-hover"
            >
              {t("status")}
              <ChevronDown aria-hidden className="size-3.5" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                <Menu.Popup
                  data-event-popover
                  className="flex min-w-[180px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden"
                >
                  {targets.map((to) => {
                    const Icon = EVENT_STATUS[to].icon;
                    return (
                      <Menu.Item
                        key={to}
                        onClick={() => change.choose(to)}
                        className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover"
                      >
                        <Icon aria-hidden className="size-4 text-muted-foreground" />
                        {tStatus(to)}
                      </Menu.Item>
                    );
                  })}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : (
          <span />
        )}
        <Link
          ref={openRef}
          href={eventHref as never}
          className="inline-flex min-h-8 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {t("open")}
        </Link>
      </div>
    </>
  );
}
