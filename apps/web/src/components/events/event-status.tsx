import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { EVENT_STATUS, type EventStatus } from "@/lib/status";

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("status.event");
  const s = EVENT_STATUS[status];
  return (
    <StatusBadge
      tone={s.tone}
      icon={s.icon}
      outline={"outline" in s && s.outline}
      strike={"strike" in s && s.strike}
    >
      {t(status)}
    </StatusBadge>
  );
}
