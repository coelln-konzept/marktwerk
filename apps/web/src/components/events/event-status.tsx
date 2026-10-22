import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { isModuleHidden } from "@/lib/modules";
import { EVENT_STATUS, type EventStatus } from "@/lib/status";

/**
 * Status chip of an event. While finance is hidden (lib/modules.ts) "abgerechnet" is not a state anyone
 * sets, so it reads as "vorbei" like "abgeschlossen" does.
 */
export function EventStatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("status.event");
  const tEvents = useTranslations("events");
  const over = isModuleHidden("finance") && (status === "closed" || status === "completed");
  const s = EVENT_STATUS[over ? "completed" : status];
  return (
    <StatusBadge
      tone={s.tone}
      icon={s.icon}
      outline={"outline" in s && s.outline}
      strike={"strike" in s && s.strike}
    >
      {over ? tEvents("statusOver") : t(status)}
    </StatusBadge>
  );
}
