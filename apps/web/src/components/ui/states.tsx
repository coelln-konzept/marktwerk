import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** True empty (teaches the first step), filtered empty (way back) and error (retry) share one layout. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  tone = "neutral",
  children,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "critical";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-10 text-center", className)}>
      <span
        className={cn(
          "grid size-10 place-items-center rounded-lg",
          tone === "critical"
            ? "bg-status-critical-bg text-status-critical"
            : "bg-status-neutral-bg text-foreground-2",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="max-w-[40ch] font-semibold">{title}</p>
      {children && <div className="flex flex-wrap justify-center gap-2">{children}</div>}
      {hint && <p className="max-w-[48ch] text-muted-foreground text-small">{hint}</p>}
    </div>
  );
}

/** Skeleton block; compose them in the shape of the content. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block h-3 animate-pulse rounded-full bg-sunken", className)} />
  );
}
