import Link from "next/link";
import { cn } from "@/lib/utils";

export type SegmentItem = { key: string; label: string; href: string; active: boolean };

/** Segmented control whose choice lives in the URL (links with `aria-current`), e.g. Spalten · Nach Person. */
export function SegmentedLinks({ label, items }: { label: string; items: SegmentItem[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-input bg-card p-0.5"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href as never}
          scroll={false}
          aria-current={item.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-7 items-center rounded-md px-3 font-medium text-small outline-none focus-visible:outline-2 focus-visible:outline-ring",
            item.active ? "bg-foreground text-background" : "text-foreground-2 hover:bg-hover",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
