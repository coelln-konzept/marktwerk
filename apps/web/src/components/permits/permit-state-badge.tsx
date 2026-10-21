import type { PermitDisplayState } from "@marktwerk/core";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/status-badge";
import { PERMIT_STATE } from "@/lib/permit-status";

/** Permit state as colour + icon + text (UX concept §7). */
export function PermitStateBadge({ state }: { state: PermitDisplayState }) {
  const t = useTranslations("permitStatus");
  const s = PERMIT_STATE[state];
  return (
    <StatusBadge tone={s.tone} icon={s.icon}>
      {t(state)}
    </StatusBadge>
  );
}
