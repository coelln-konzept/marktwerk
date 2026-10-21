import type * as React from "react";
import { cn } from "@/lib/utils";

/** The design's basic surface: white card, 1 px line, 12 px radius. */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-xl border bg-card", className)} {...props} />;
}

export function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-border-subtle border-b px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("font-semibold text-[15px]", className)} {...props} />;
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-border-subtle border-t px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}
