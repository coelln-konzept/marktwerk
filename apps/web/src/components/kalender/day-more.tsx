"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { fromEventPopover } from "./event-popover";

/**
 * "+ N weitere" in a Kalender day cell: opens every entry of that day in a popover, in place (handwritten
 * notes HN-10), with the same chips as the cell. The link at the bottom still leads to the list from that day.
 */
export function DayMore({
  label,
  aria,
  title,
  listHref,
  listLabel,
  children,
}: {
  /** Visible trigger text ("+ 3 weitere"). */
  label: string;
  /** Accessible name of the trigger, naming the day. */
  aria: string;
  /** Popover heading: the day. */
  title: string;
  listHref: string;
  listLabel: string;
  /** All entries of the day as `<li>`s. */
  children: React.ReactNode;
}) {
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
        className="block w-full cursor-pointer rounded-md px-1 py-0.5 text-left font-medium text-accent-soft-foreground text-tiny hover:bg-hover hover:underline focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
      >
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup className="flex max-h-[min(420px,70vh)] w-[min(280px,calc(100vw-24px))] flex-col rounded-xl border bg-popover p-2 text-popover-foreground shadow-pop outline-hidden">
            <Popover.Title className="tabular m-0 px-1 pb-1.5 font-semibold text-small">
              {title}
            </Popover.Title>
            <ul className="m-0 flex min-h-0 list-none flex-col gap-0.5 overflow-y-auto p-0">
              {children}
            </ul>
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
