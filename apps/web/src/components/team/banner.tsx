import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TONES = {
  critical: "bg-status-critical-bg text-status-critical",
  warn: "bg-status-warn-bg text-status-warn",
  info: "bg-status-info-bg text-status-info",
} as const;

/** A line above a table: colour + icon + text, with an optional action. */
export function Banner({
  tone,
  icon: Icon,
  action,
  children,
}: {
  tone: keyof typeof TONES;
  icon: LucideIcon;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "critical" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-small",
        TONES[tone],
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action && (
        <Link
          href={action.href as never}
          className="inline-flex min-h-7 items-center rounded-md border border-current px-2 font-semibold text-tiny hover:bg-card/40"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
