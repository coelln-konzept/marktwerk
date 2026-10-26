import type { InstallmentState, PayableStatus } from "@marktwerk/core";
import { Check, CircleDashed, CircleDot, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";
import { OVERDUE_ICON } from "@/lib/due-ui";

/** Status is colour + icon + text (UX concept §7). One look for rates and for the payable they belong to. */
const UI = {
  open: { tone: "neutral", icon: CircleDashed, outline: true },
  partially_paid: { tone: "info", icon: CircleDot },
  overdue: { tone: "critical", icon: OVERDUE_ICON },
  paid: { tone: "ok", icon: Check },
  cancelled: { tone: "neutral", icon: X, strike: true },
} as const satisfies Record<
  PayableStatus,
  { tone: Tone; icon: typeof Check; outline?: boolean; strike?: boolean }
>;

/** Badge of a payable (derived status) or of one rate. */
export function FinanceStatusBadge({ status }: { status: PayableStatus | InstallmentState }) {
  const t = useTranslations("finance.status");
  const ui = UI[status];
  return (
    <StatusBadge
      tone={ui.tone}
      icon={ui.icon}
      outline={"outline" in ui && ui.outline}
      strike={"strike" in ui && ui.strike}
    >
      {t(status)}
    </StatusBadge>
  );
}

/** "Kritisch": landlord, permit or penalty. */
export function CriticalBadge() {
  const t = useTranslations("finance");
  return (
    <StatusBadge tone="warn" icon={ShieldAlert}>
      {t("critical")}
    </StatusBadge>
  );
}
