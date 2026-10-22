import { useId } from "react";
import { cn } from "@/lib/utils";
import { FilterChip } from "./chip";
import { type SegmentItem, Segments } from "./segmented-links";

/**
 * The shared pattern for filter rows above lists and boards (URL-driven, every choice is a link).
 *
 * ```tsx
 * <FilterBar>
 *   <FilterGroup label={t("view.label")}>
 *     <Segments items={...} />                      // single choice: one connected control
 *   </FilterGroup>
 *   <FilterGroup label={t("filter.category")} wide>
 *     <FilterChips>
 *       <FilterChip href=... active count={n}>…</FilterChip>   // one-of-many with counts: chips
 *     </FilterChips>
 *   </FilterGroup>
 * </FilterBar>
 * ```
 *
 * Order, left to right / top to bottom: what you look at (view) → how much (time, scope) → how it is
 * arranged (grouping) → what it is about (categories, the longest group, so it gets its own row).
 */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-x-8 gap-y-3", className)}>{children}</div>
  );
}

/** One labelled filter: small muted visible label above the control, exposed as a named group. */
export function FilterGroup({
  label,
  wide,
  children,
  className,
}: {
  /** Visible label and accessible name of the group. */
  label: string;
  /** Take a full row (long chip lists). */
  wide?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls
    <div
      role="group"
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col gap-1.5", wide && "basis-full", className)}
    >
      <span id={id} className="font-medium text-muted-foreground text-tiny">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Wrapping row of filter chips (one-of-many or toggles, usually with counts). */
export function FilterChips({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export type { SegmentItem };
export { FilterChip, Segments };
