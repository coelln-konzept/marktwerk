import type * as React from "react";
import { cn } from "@/lib/utils";

/** Data table: sticky header, row height from the density token, tabular figures. */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-[2] bg-surface-2", className)} {...props} />;
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 whitespace-nowrap border-b px-3 py-1 font-semibold text-muted-foreground text-tiny",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group/row border-border-subtle border-b last:border-b-0 hover:bg-hover aria-selected:bg-selected",
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
