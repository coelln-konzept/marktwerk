import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Data table: sticky header, row height from the density token, tabular figures. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // relative: sr-only cells are absolutely positioned and would otherwise escape the scroller and
    // widen the whole page on phones.
    <div className="relative overflow-x-auto">
      <table className={cn("w-full border-collapse text-left", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-[2] bg-surface-2", className)} {...props} />;
}

export type THSort = {
  /** The URL that sorts by this column (the other direction when it is already the sort). */
  href: string;
  /** This column's current direction, or null when the table is sorted by another one. */
  dir: "asc" | "desc" | null;
};

/** A column header; with `sort` the label is a link that sorts by it (arrow shows the direction). */
export function TH({
  className,
  sort,
  children,
  ...props
}: React.ComponentProps<"th"> & { sort?: THSort }) {
  const Arrow = sort?.dir === "asc" ? ArrowUp : sort?.dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={
        sort?.dir === "asc" ? "ascending" : sort?.dir === "desc" ? "descending" : undefined
      }
      className={cn(
        "h-8 whitespace-nowrap border-b px-3 py-1 font-semibold text-muted-foreground text-tiny",
        className,
      )}
      {...props}
    >
      {sort ? (
        <Link
          href={sort.href as never}
          scroll={false}
          className={cn(
            "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            sort.dir && "text-foreground",
          )}
        >
          {children}
          <Arrow aria-hidden className={cn("size-3", !sort.dir && "opacity-40")} />
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

/**
 * Keyboard focus on a list row (KeyboardRows, J/K, Tab): the selected tint plus a 2px inset ring in the
 * accent. The tint alone is ~1.1:1 against the card and doesn't count as a visible focus (WCAG 2.4.7).
 * Use it on every focusable row instead of `outline-hidden focus-visible:bg-selected`.
 */
export const rowFocus =
  "focus-visible:bg-selected focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * A table row. The row whose Vorschau/drawer is open carries `aria-current` (not `aria-selected`, which
 * is only valid inside grid/listbox roles) and gets the selected tint.
 */
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row border-border-subtle border-b last:border-b-0 hover:bg-hover aria-[current=true]:bg-selected",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("h-row px-3 py-(--cell-y) align-middle", className)} {...props} />;
}

/** Group row ("Überfällig 2"). */
export function TGroup({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr className="bg-sunken">
      <th
        colSpan={colSpan}
        scope="colgroup"
        className="h-8 px-3 py-1 text-left font-semibold text-foreground-2 text-tiny"
      >
        {children}
      </th>
    </tr>
  );
}

/** Row actions that become fully visible on hover/focus (never hidden from keyboard users). */
export function RowActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 opacity-50 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
