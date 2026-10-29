"use client";

import { ChevronDown, ListFilter } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Phones (< 640 px): the filters of a list sit behind one "Filter" button that also reads out the
 * active filters, so a narrowed list never looks unfiltered. From 640 px on the button is gone and the
 * children flow into the surrounding row (`display: contents`), exactly as without the wrapper. The
 * children stay in the DOM when closed, so a surrounding GET form still submits their values.
 */
export function FilterToggle({
  label,
  summary,
  children,
}: {
  /** Button text, e.g. "Filter". */
  label: string;
  /** The active filters as text ("Antikmarkt · Saison 2027"); nothing when none is set. */
  summary?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover sm:hidden"
      >
        <ListFilter aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0">{label}</span>
        {summary && (
          <span className="min-w-0 truncate font-semibold text-accent-soft-foreground">
            : {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        id={panelId}
        className={cn(
          "max-sm:hidden sm:contents",
          open && "max-sm:flex max-sm:basis-full max-sm:flex-col max-sm:gap-3",
        )}
      >
        {children}
      </div>
    </>
  );
}
