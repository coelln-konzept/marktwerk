import type { MissingTask } from "@marktwerk/core";
import { Ban, Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";
import { DueBadge } from "@/components/ui/due-badge";
import { StatusBadge } from "@/components/ui/status-badge";

/**
 * Why a task is in "Was fehlt" (event Überblick, market panel), in the one status vocabulary: due-ness as
 * `DueBadge` (Überfällig · 3 Tage, Heute, Morgen, in 4 Tagen, Wartet seit …), "Blockiert" and a wait that has
 * not passed its date as their status.
 */
export function MissingReasonBadge({
  task,
  today,
}: {
  task: Pick<MissingTask, "reason" | "dueOn" | "status">;
  today: string;
}) {
  const t = useTranslations("eventDetail.overview.missing.reason");
  if (task.reason === "blocked")
    return (
      <StatusBadge tone="warn" icon={Ban}>
        {t("blocked")}
      </StatusBadge>
    );
  if (task.reason === "waiting" && (task.dueOn === null || task.dueOn >= today))
    return (
      <StatusBadge tone="waiting" icon={Hourglass}>
        {t("waiting")}
      </StatusBadge>
    );
  return <DueBadge dueOn={task.dueOn} today={today} status={task.status} />;
}
