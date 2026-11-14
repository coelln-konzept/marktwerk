import { type LucideIcon, SearchX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

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

/**
 * The filtered-empty state of every list (UX-070): one wording, the search echoed back, and the way out.
 * "Nichts gefunden für „Kölm“" with a search, "Nichts gefunden für diese Filter" without one, and a
 * "Filter zurücksetzen" link to `resetHref` (the list without search, filters and paging). `hint` adds a
 * line under it (e.g. "Archivierte Orte zeigt das Archiv."); `children` replace the reset link.
 */
export function NoResults({
  query,
  resetHref,
  hint,
  children,
  className,
}: {
  query?: string;
  resetHref: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("emptyState");
  const q = query?.trim();
  return (
    <EmptyState
      icon={SearchX}
      title={q ? t("query", { query: q }) : t("filtered")}
      hint={hint}
      className={className}
    >
      {children ?? (
        <Link href={resetHref as never} scroll={false} className={buttonVariants()}>
          {t("reset")}
        </Link>
      )}
    </EmptyState>
  );
}

/** Skeleton block; compose them in the shape of the content. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block h-3 animate-pulse rounded-full bg-sunken", className)} />
  );
}
