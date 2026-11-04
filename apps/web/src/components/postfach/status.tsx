"use client";

import type { ConversationStatus } from "@marktwerk/core";
import { CircleCheck, CircleDot, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge, type Tone } from "@/components/ui/status-badge";

export const STATUS_META: Record<ConversationStatus, { tone: Tone; icon: typeof CircleDot }> = {
  offen: { tone: "info", icon: CircleDot },
  wartet: { tone: "waiting", icon: Clock },
  erledigt: { tone: "ok", icon: CircleCheck },
};

/** Status is colour + icon + text (UX concept §7). */
export function ConversationStatusBadge({ status }: { status: ConversationStatus }) {
  const t = useTranslations("postfach.status");
  const m = STATUS_META[status];
  return (
    <StatusBadge tone={m.tone} icon={m.icon}>
      {t(status)}
    </StatusBadge>
  );
}
