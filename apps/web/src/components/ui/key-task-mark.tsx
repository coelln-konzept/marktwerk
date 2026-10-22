import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The quiet "Kernaufgabe" marker: a small star with a tooltip explaining it (and a screen-reader label),
 * no badge. `label` replaces the default explanation where a caller needs other wording.
 */
export function KeyTaskMark({ className, label }: { className?: string; label?: string }) {
  const t = useTranslations("tasks.keyTask");
  const text = label ?? t("tooltip");
  return (
    <span title={text} className={cn("inline-flex shrink-0 text-foreground-2", className)}>
      {/* Filled, so it reads as "marked" rather than as an empty star to click. */}
      <Star aria-hidden className="size-3.5 fill-current" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
