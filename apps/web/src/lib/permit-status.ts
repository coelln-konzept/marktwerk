import type { PermitDisplayState } from "@marktwerk/core";
import {
  Check,
  CircleAlert,
  CircleDashed,
  History,
  Hourglass,
  type LucideIcon,
  Minus,
  Repeat2,
  TimerOff,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Tone } from "@/components/ui/status-badge";

/**
 * Permit states → badge (UX concept §7: Fehlt red ! · In Vorbereitung blue ◐ · Beantragt violet ⏳ ·
 * Genehmigt green ✓ · Abgelehnt red ✕ · Läuft ab amber ⚠ · Abgelaufen red ⌛ · Nicht nötig grey –).
 */
export const PERMIT_STATE = {
  missing: { tone: "critical", icon: CircleAlert },
  preparing: { tone: "info", icon: CircleDashed },
  applied: { tone: "waiting", icon: Hourglass },
  granted: { tone: "ok", icon: Check },
  expiring: { tone: "warn", icon: TriangleAlert },
  expired: { tone: "critical", icon: TimerOff },
  rejected: { tone: "critical", icon: X },
  not_required: { tone: "neutral", icon: Minus },
  past: { tone: "neutral", icon: History },
  superseded: { tone: "neutral", icon: Repeat2 },
} as const satisfies Record<PermitDisplayState, { tone: Tone; icon: LucideIcon }>;

/** The states in the order of the summary strip. */
export const PERMIT_STATE_ORDER: PermitDisplayState[] = [
  "missing",
  "preparing",
  "applied",
  "granted",
  "expiring",
  "expired",
  "rejected",
  "not_required",
  "past",
];

export const PERMIT_TYPE_KEYS = [
  "market_permit",
  "water",
  "signage",
  "no_parking",
  "toilets",
  "landowner_ok",
  "gema",
  "safety_concept",
  "traffic_order",
  "catering",
  "insurance",
  "other",
] as const;
