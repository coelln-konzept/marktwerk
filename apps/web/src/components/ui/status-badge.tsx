import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "critical" | "neutral" | "info" | "waiting";

const TONES: Record<Tone, string> = {
  ok: "bg-status-ok-bg text-status-ok",
  warn: "bg-status-warn-bg text-status-warn",
  critical: "bg-status-critical-bg text-status-critical",
  neutral: "bg-status-neutral-bg text-status-neutral",
  info: "bg-status-info-bg text-status-info",
  waiting: "bg-status-waiting-bg text-status-waiting",
};

/** Status is always colour + icon + text (UX concept §7). */
export function StatusBadge({
  tone,
  icon: Icon,
  outline,
  strike,
  className,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  /** Outlined variant, e.g. "Entwurf". */
  outline?: boolean;
  /** Struck-through text, e.g. "abgesagt". */
  strike?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full py-0 pr-2 pl-1.5 font-semibold text-tiny leading-none in-data-[density=compact]:h-5",
        TONES[tone],
        outline && "bg-transparent shadow-[inset_0_0_0_1px_var(--input)]",
        strike && "line-through",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
      {children}
    </span>
  );
}

/** "↻2": task carried over for n days. */
export function RolloverBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      title={label}
      className="tabular inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded-sm bg-status-warn-bg px-1.5 font-bold text-[11.5px] text-status-warn"
    >
      <span aria-hidden>↻</span>
      {count}
      <span className="sr-only">{label}</span>
    </span>
  );
}
