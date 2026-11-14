"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A due group that phones show as one line ("Überfällig 38 · Anzeigen"), so "Heute" stays in view (UX-006,
 * default of UX audit round 1). From 768 px the button is gone and the group shows as usual. The group's own
 * band should hide below 768 px (the button stands in for it). No JS: the group stays collapsed on phones.
 */
export function PhoneCollapse({
  label,
  count,
  icon,
  bandClassName,
  showLabel,
  hideLabel,
  className,
  children,
}: {
  /** The group's name, e.g. "Überfällig". */
  label: string;
  count: number;
  /** The group's icon, already rendered (server components cannot pass the component itself). */
  icon: React.ReactNode;
  /** The band colours of the group (colour + icon + text, like the band it replaces). */
  bandClassName: string;
  showLabel: string;
  hideLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-center gap-2 border-y px-4 py-2 text-left font-semibold text-body focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 md:hidden",
          bandClassName,
        )}
      >
        {icon}
        {label}
        <span className="tabular inline-grid h-5 min-w-6 place-items-center rounded-full bg-card/80 px-1.5 font-semibold text-tiny">
          {count}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-small">
          {open ? hideLabel : showLabel}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      <div id={id} className={cn(!open && "max-md:hidden")}>
        {children}
      </div>
    </div>
  );
}
