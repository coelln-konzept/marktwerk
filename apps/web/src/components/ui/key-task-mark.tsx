import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** The quiet "Kernaufgabe" marker: a small star with a screen-reader label, no badge. */
export function KeyTaskMark({ className }: { className?: string }) {
  const t = useTranslations("tasks.keyTask");
  return (
    <span title={t("label")} className={cn("inline-flex shrink-0 text-foreground-2", className)}>
      {/* Filled, so it reads as "marked" rather than as an empty star to click. */}
      <Star aria-hidden className="size-3.5 fill-current" />
      <span className="sr-only">{t("label")}</span>
    </span>
  );
}
