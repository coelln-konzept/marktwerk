import { ChevronDown, ListFilter } from "lucide-react";
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
  hideLabel,
  children,
  className,
}: {
  /** Visible label and accessible name of the group. */
  label: string;
  /** Take a full row (long chip lists). */
  wide?: boolean;
  /**
   * Keep the label for assistive technology only: for a lone group whose control says it all (two views
   * side by side), where a visible "Ansicht" would only repeat what the segments show.
   */
  hideLabel?: boolean;
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
      <span
        id={id}
        className={cn("font-medium text-muted-foreground text-tiny", hideLabel && "sr-only")}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Filters behind one button: closed by default, and the active filter reads out next to the label so a
 * narrowed list never looks unfiltered. Native `<details>`: works without client code and by keyboard.
 *
 * Takes a full row by default. `inline` lets the closed button sit at the end of the row of the other
 * filters from `sm` up (bottom-aligned with their controls); opened, its content wraps onto its own line.
 */
export function FilterDisclosure({
  label,
  summary,
  inline,
  children,
}: {
  /** Button text, e.g. "Filter". */
  label: string;
  /** The active filter as text ("Genehmigungen"); nothing when no filter is set. */
  summary?: string | null;
  /** Share the row with the other filters from `sm` up instead of taking a row of its own. */
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className={cn("group basis-full", inline && "sm:basis-auto sm:self-end")}>
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-input bg-card px-3 font-medium text-small hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring group-open:bg-sunken [&::-webkit-details-marker]:hidden">
        <ListFilter aria-hidden className="size-4 text-muted-foreground" />
        {label}
        {summary && <span className="font-semibold text-accent-soft-foreground">: {summary}</span>}
        <ChevronDown
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Wrapping row of filter chips (one-of-many or toggles, usually with counts). */
export function FilterChips({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export type { SegmentItem };
export { FilterChip, Segments };
