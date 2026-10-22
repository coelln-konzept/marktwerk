import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  /** Optional count shown after the label (e.g. open tasks). */
  count?: number;
};

/** The connected segments themselves (no group semantics); use inside a labelled group. */
export function Segments({ items }: { items: SegmentItem[] }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-input bg-sunken p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href as never}
          scroll={false}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-small outline-none focus-visible:outline-2 focus-visible:outline-ring",
            item.active
              ? "bg-foreground text-background shadow-card"
              : "text-foreground-2 hover:bg-hover",
          )}
        >
          {item.label}
          {item.count !== undefined && (
            <span
              className={cn(
                "tabular inline-grid h-5 min-w-5 place-items-center rounded-full px-1 font-semibold text-[11.5px]",
                item.active ? "bg-white/20 text-inherit" : "bg-status-neutral-bg text-foreground-2",
              )}
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/**
 * Segmented control whose choice lives in the URL (links with `aria-current`), e.g. Spalten · Nach Person.
 * Stand-alone: carries its own labelled group. Inside a `FilterGroup` use `Segments` instead.
 */
export function SegmentedLinks({ label, items }: { label: string; items: SegmentItem[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls
    <div role="group" aria-label={label} className="inline-flex max-w-full">
      <Segments items={items} />
    </div>
  );
}
