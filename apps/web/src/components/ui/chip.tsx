import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full border border-input bg-card px-3 font-medium text-small hover:bg-hover aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background";

function Count({ value }: { value: number }) {
  return (
    <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2 in-aria-[current=true]:bg-white/20 in-aria-[current=true]:text-inherit">
      {value}
    </span>
  );
}

/** Filter chip with a count. Rendered as a link so filters live in the URL. */
export function FilterChip({
  href,
  active,
  count,
  children,
  className,
}: {
  href: string;
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href as never}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(base, className)}
    >
      {children}
      {count !== undefined && <Count value={count} />}
    </Link>
  );
}
