import { cn } from "@/lib/utils";

export type HealthLevel = "ok" | "warn" | "critical" | "none";

const DOT: Record<HealthLevel, string> = {
  ok: "text-status-ok-dot",
  warn: "text-status-warn-dot",
  critical: "text-status-critical-dot",
  none: "text-status-neutral-dot",
};

/** Shape carries the meaning too: ● ok, ▲ attention, ■ critical, ○ open (works without colour). */
export function HealthShape({ level, className }: { level: HealthLevel; className?: string }) {
  const cls = cn("size-3.5 shrink-0", DOT[level], className);
  switch (level) {
    case "ok":
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={cls}>
          <circle cx="8" cy="8" r="4" fill="currentColor" />
        </svg>
      );
    case "warn":
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={cls}>
          <path d="M8 3.5 13 12.5H3Z" fill="currentColor" />
        </svg>
      );
    case "critical":
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={cls}>
          <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden viewBox="0 0 16 16" className={cls}>
          <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function Health({
  level,
  label,
  className,
}: {
  level: HealthLevel;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 whitespace-nowrap text-small",
        className,
      )}
    >
      <HealthShape level={level} />
      {label}
    </span>
  );
}
