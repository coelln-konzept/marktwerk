"use client";

import { Eye, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MarketMarker } from "@/components/ui/market-marker";
import { cn } from "@/lib/utils";

export type YearLegendItem = {
  key: string;
  /** "Altstadt", or "Einzeltermine". */
  name: string;
  code: string | null;
  color: string | null;
  typeKey: string | null;
  /** "7 Termine" */
  countLabel: string;
  /** Accessible name: "Altstadt (ALT), 7 Termine". */
  label: string;
  /** Switched off: its dots are hidden. */
  hidden: boolean;
  /** The Jahr view with this market switched the other way. */
  href: string;
};

/**
 * Legend of the Jahresübersicht (Fahrplan R22): every market with its colour, Kürzel, name and number of
 * dates, like the legend on the wall calendar. Each line is a toggle button (pressed = shown) that hides or
 * shows the market's dots; the choice is a URL (`?ohne=`), so it survives the year switch and can be
 * shared or printed. Switched-off markets are not printed.
 */
export function YearLegend({
  title,
  items,
  showAllHref,
  showAllLabel,
  hint,
}: {
  title: string;
  items: YearLegendItem[];
  /** "Alle zeigen", only while something is switched off. */
  showAllHref?: string;
  showAllLabel: string;
  /** "Klick blendet einen Markt aus oder ein" */
  hint: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (href: string) =>
    startTransition(() => router.replace(href as never, { scroll: false }));

  return (
    <section
      aria-labelledby="jahr-legend-title"
      aria-busy={pending || undefined}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-card print:gap-[1mm] print:rounded-none print:border-0 print:border-t print:p-0 print:pt-[1.5mm] print:shadow-none"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="jahr-legend-title" className="m-0 font-semibold text-[15px] print:text-[8pt]">
          {title}
        </h3>
        <span className="text-muted-foreground text-tiny print:hidden">{hint}</span>
        {pending && (
          <LoaderCircle
            aria-hidden
            className="size-4 text-muted-foreground motion-safe:animate-spin"
          />
        )}
        {showAllHref && (
          <button
            type="button"
            onClick={() => go(showAllHref)}
            className="ml-auto inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 font-medium text-accent-soft-foreground text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring print:hidden"
          >
            <Eye aria-hidden className="size-3.5" />
            {showAllLabel}
          </button>
        )}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0 print:gap-x-[3mm] print:gap-y-[1mm] print:text-[6.5pt] print:leading-none">
        {items.map((item) => (
          <li key={item.key} className={cn(item.hidden && "print:hidden")}>
            <button
              type="button"
              aria-pressed={!item.hidden}
              aria-label={item.label}
              onClick={() => go(item.href)}
              className={cn(
                "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-card px-2.5 text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring print:min-h-0 print:gap-[1mm] print:border-0 print:px-0 print:text-[6.5pt] print:leading-none",
                item.hidden && "border-dashed text-muted-foreground",
              )}
            >
              <MarketMarker
                color={item.color}
                typeKey={item.typeKey}
                shape="dot"
                className={cn("size-2.5 print:size-[2mm]", item.hidden && "opacity-40")}
              />
              {item.code && (
                <span className="font-semibold text-[11px] tracking-wide print:text-[6.5pt]">
                  {item.code}
                </span>
              )}
              <span className={cn(item.hidden && "line-through")}>{item.name}</span>
              <span className="tabular text-muted-foreground text-tiny print:text-[6pt]">
                {item.countLabel}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
