import type { SeasonStatus } from "@marktwerk/core";
import { CalendarCheck, CircleDashed, Lock, type LucideIcon } from "lucide-react";
import type { Tone } from "@/components/ui/status-badge";

/** Saison status as colour + icon + text (UX concept §7): In Planung · Termine stehen · Abgeschlossen. */
export const SEASON_STATUS_UI: Record<SeasonStatus, { tone: Tone; icon: LucideIcon }> = {
  planning: { tone: "info", icon: CircleDashed },
  dates_set: { tone: "ok", icon: CalendarCheck },
  closed: { tone: "neutral", icon: Lock },
};
