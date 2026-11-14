"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fromEventPopover } from "./event-popover";

/**
 * "+ N weitere" in a Kalender day cell: opens every entry of that day in a popover, in place (handwritten
 * notes HN-10), with the same chips as the cell. The link at the bottom still leads to the list from that day.
 * On phones the whole day is such a trigger (`trigger`, UX-003): it shows a dot per entry, and the popover
 * also offers "Besprechung anlegen" and says when nothing is planned.
 */
export function DayMore({
  label,
  trigger,
  triggerClassName,
  aria,
  title,
  listHref,
  listLabel,
  addHref,
  addLabel,
  emptyLabel,
  children,
}: {
  /** Visible trigger text ("+ 3 weitere"). */
  label?: string;
  /** Trigger content instead of `label` (the dots of the phone layout). */
  trigger?: React.ReactNode;
  triggerClassName?: string;
  /** Accessible name of the trigger, naming the day. */
  aria: string;
  /** Popover heading: the day. */
  title: string;
  listHref: string;
  listLabel: string;
  /** "Besprechung anlegen" for that day (phone layout, when the person may create one). */
  addHref?: string;
  addLabel?: string;
  /** Shown instead of the entries when the day has none. */
  emptyLabel?: string;
  /** All entries of the day as `<li>`s. */
  children?: React.ReactNode;
}) {
  const empty = !children || (Array.isArray(children) && children.length === 0);
  return (
    <Popover.Root
      // An event chip in here opens the event popover on top: pressing, focusing or Esc in that one must
      // not close this one (it holds the chip the event popover is anchored to).
      onOpenChange={(open, details) => {
        if (!open && fromEventPopover(details)) details.cancel();
      }}
    >
      <Popover.Trigger
        aria-label={aria}
        className={cn(
          "block w-full cursor-pointer rounded-md px-1 py-0.5 text-left font-medium text-accent-soft-foreground text-tiny hover:bg-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover",
          triggerClassName,
        )}
      >
        {trigger ?? label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup className="flex max-h-[min(420px,70vh)] w-[min(280px,calc(100vw-24px))] flex-col rounded-xl border bg-popover p-2 text-popover-foreground shadow-pop outline-hidden">
            <Popover.Title className="tabular m-0 px-1 pb-1.5 font-semibold text-small">
              {title}
            </Popover.Title>
            {empty ? (
              emptyLabel && (
                <p className="m-0 px-1 text-muted-foreground text-small">{emptyLabel}</p>
              )
            ) : (
              <ul className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto p-0">
                {children}
              </ul>
            )}
            {addHref && addLabel && (
              <Link
                href={addHref as never}
                scroll={false}
                className="mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 font-medium text-accent-soft-foreground text-small hover:bg-hover"
              >
                <Plus aria-hidden className="size-3.5" />
                {addLabel}
              </Link>
            )}
            <Link
              href={listHref as never}
              scroll={false}
              className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md border-border-subtle border-t px-1 pt-1.5 font-medium text-foreground-2 text-small hover:text-foreground hover:underline"
            >
              {listLabel}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
