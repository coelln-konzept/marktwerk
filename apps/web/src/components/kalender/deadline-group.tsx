"use client";

import { Popover } from "@base-ui/react/popover";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * A Kalender summary ("65 Genehmigungen: Entscheidung erwartet") opens exactly the entries it stands for,
 * in place, each linking to its own record (UT-11 #2). The link at the bottom leads to the whole module.
 */
export function DeadlineGroup({
  aria,
  title,
  items,
  allHref,
  allLabel,
  className,
  children,
}: {
  /** Accessible name of the trigger. */
  aria: string;
  /** Popover heading: the summary sentence. */
  title: string;
  items: { key: string; href: string; text: string }[];
  allHref: string;
  allLabel: string;
  className?: string;
  /** What the trigger shows (the chip or row content). */
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={aria}
        className={`cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-ring ${className ?? ""}`}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
          <Popover.Popup className="flex max-h-[min(420px,70vh)] w-[min(340px,calc(100vw-24px))] flex-col rounded-xl border bg-popover p-2 text-popover-foreground shadow-pop outline-hidden">
            <Popover.Title className="m-0 px-1 pb-1.5 font-semibold text-small">
              {title}
            </Popover.Title>
            <ul className="m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href as never}
                    className="block rounded-md px-1 py-1 text-small hover:bg-hover hover:underline"
                  >
                    {item.text}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={allHref as never}
              className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md border-border-subtle border-t px-1 pt-1.5 font-medium text-foreground-2 text-small hover:text-foreground hover:underline"
            >
              {allLabel}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
