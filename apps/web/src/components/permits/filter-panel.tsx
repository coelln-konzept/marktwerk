"use client";

import { ChevronDown, ListFilter } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The filters of the Genehmigungen page. From the `md` breakpoint on they are simply there (selects and
 * status chips, the view switch at the right). On a phone they hide behind one "Filter" button, so the
 * first permit is not pushed below the fold by ~560 px of controls; the view switch stays in reach and
 * the button says how many filters are active. The filter controls themselves are server-rendered
 * children (links and a GET form), so nothing here depends on client state except open / closed.
 */
export function FilterPanel({
  label,
  activeLabel,
  viewSwitch,
  children,
}: {
  label: string;
  /** "2 aktiv" when filters are set, otherwise null. */
  activeLabel: string | null;
  viewSwitch: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring",
            open && "bg-sunken",
          )}
        >
          <ListFilter aria-hidden className="size-4 text-muted-foreground" />
          {label}
          {activeLabel && (
            <span className="font-semibold text-accent-soft-foreground">: {activeLabel}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {viewSwitch}
      </div>
      <div id={id} className={cn("flex-col gap-3 md:flex", open ? "flex" : "hidden")}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <div className="hidden md:block">{viewSwitch}</div>
        </div>
      </div>
    </div>
  );
}
