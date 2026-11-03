import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/** Rows per page in the Archiv (product owner 2026-11-03: pages instead of one long list). */
export const PAGE_SIZE = 50;

/** The page from `?seite=` (1-based), kept inside 1…last. */
export function pageOf(value: string | undefined, total: number, size = PAGE_SIZE): number {
  const last = Math.max(1, Math.ceil(total / size));
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, last) : 1;
}

/** Page numbers to show: first, last and the two around the current one, with gaps as null. */
function pageList(page: number, last: number): (number | null)[] {
  const keep = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && n - prev > 1) out.push(null);
    out.push(n);
  }
  return out;
}

/**
 * "1–50 von 148" and the page links (← 1 … 4 5 6 … 12 →). Pages are URLs (`?seite=`), so back, reload and
 * links keep the page. Renders nothing for a single page.
 */
export async function Pager({
  page,
  total,
  href,
  size = PAGE_SIZE,
  className,
}: {
  page: number;
  total: number;
  /** The URL of a page (the caller keeps its filters). */
  href: (page: number) => string;
  size?: number;
  className?: string;
}) {
  const t = await getTranslations("pager");
  const last = Math.max(1, Math.ceil(total / size));
  if (last <= 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const cell =
    "inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 text-small tabular hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <nav
      aria-label={t("label")}
      className={cn("flex flex-wrap items-center justify-between gap-2", className)}
    >
      <span className="tabular text-muted-foreground text-small">
        {t("range", { from, to, total })}
      </span>
      <span className="flex flex-wrap items-center gap-0.5">
        {page > 1 ? (
          <Link href={href(page - 1) as never} className={cell} aria-label={t("prev")}>
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className={cn(cell, "text-faint-foreground hover:bg-transparent")} aria-hidden>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {pageList(page, last).map((n, i) =>
          n === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: gaps have no identity of their own
            <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Link
              key={n}
              href={href(n) as never}
              aria-current={n === page ? "page" : undefined}
              aria-label={t("page", { n })}
              className={cn(
                cell,
                n === page && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {n}
            </Link>
          ),
        )}
        {page < last ? (
          <Link href={href(page + 1) as never} className={cell} aria-label={t("next")}>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <span className={cn(cell, "text-faint-foreground hover:bg-transparent")} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </span>
    </nav>
  );
}
