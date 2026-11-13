import * as React from "react";
import { cn } from "@/lib/utils";

/** The card itself: white surface, 1 px line, 12 px radius. */
const CARD = "rounded-xl border bg-card";

type PanelProps = Omit<React.ComponentProps<"section">, "title"> & {
  /**
   * The section's name. A titled panel renders it **outside** the card as a real heading (h2, decision
   * 2026-11-13, "option C"): the page reads heading → card → group bands → rows. Without a title the panel is
   * the bare card (name it with `aria-label`, or put a {@link PanelHeader} inside).
   */
  title?: React.ReactNode;
  /** Id of the heading (it labels the section); generated when left out. */
  titleId?: string;
  /** Muted text right after the title: a count, a short hint. */
  meta?: React.ReactNode;
  /** Links and buttons for the section, at the right of the heading line. */
  actions?: React.ReactNode;
  /**
   * Classes for the card of a titled panel; `className` goes to the whole section (its place in the page
   * grid). Without a title both end up on the card.
   */
  cardClassName?: string;
};

/**
 * The design's basic surface. With `title` it is a section: the heading line (title, `meta`, `actions` on
 * the right) above the card, a small gap between them. That is the default way a titled panel renders.
 */
export function Panel({
  title,
  titleId,
  meta,
  actions,
  className,
  cardClassName,
  children,
  ...props
}: PanelProps) {
  const generated = React.useId();
  if (title === undefined)
    return (
      <section className={cn(CARD, className, cardClassName)} {...props}>
        {children}
      </section>
    );
  const id = titleId ?? `panel-${generated}`;
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col", className)} {...props}>
      <PanelHeading id={id} meta={meta} actions={actions}>
        {title}
      </PanelHeading>
      <div className={cn(CARD, "min-w-0 flex-1", cardClassName)}>{children}</div>
    </section>
  );
}

/**
 * The heading line of a titled section, outside its card: h2 at 18 px, semibold (between the page title at
 * 22 px and the 15 px headings inside cards), with optional muted `meta` and right-aligned `actions`.
 * {@link Panel} uses it for `title`; use it alone for a section whose body is not one card.
 */
export function PanelHeading({
  id,
  meta,
  actions,
  className,
  children,
}: {
  id?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-2 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id={id} className="m-0 font-semibold text-[18px] leading-tight tracking-tight">
          {children}
        </h2>
        {/* A count of 0 is shown too. */}
        {meta != null && meta !== false && meta !== "" && (
          <span className="tabular text-muted-foreground text-small">{meta}</span>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A header row inside the card, for panels that keep their title in the card (forms with a disclosure,
 * tool bars). New sections use {@link Panel}'s `title` instead.
 */
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

/** A quiet text link for a section's `actions` ("Alle Veranstaltungen", "Zu den Notizen"). */
export const panelActionLink =
  "inline-flex min-h-8 items-center gap-1 rounded-lg px-2 font-medium text-accent-soft-foreground text-small hover:bg-hover hover:underline";
