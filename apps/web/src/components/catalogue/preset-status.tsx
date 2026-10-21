import { CircleCheck, CircleOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";

/** aktiv / inaktiv: colour + icon + text. */
export function PresetStatusBadge({ active }: { active: boolean }) {
  const t = useTranslations("templates");
  return active ? (
    <StatusBadge tone="ok" icon={CircleCheck}>
      {t("active")}
    </StatusBadge>
  ) : (
    <StatusBadge tone="neutral" icon={CircleOff} outline>
      {t("inactive")}
    </StatusBadge>
  );
}
