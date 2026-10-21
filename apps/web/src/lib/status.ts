import {
  Ban,
  Check,
  CircleDashed,
  CircleDot,
  Clock,
  Hourglass,
  type LucideIcon,
  PlayCircle,
  ReceiptText,
  X,
} from "lucide-react";
import type { Tone } from "@/components/ui/status-badge";

/** Event lifecycle → badge (legend: Entwurf · geplant · bestätigt · läuft · abgeschlossen · abgerechnet · abgesagt). */
export const EVENT_STATUS = {
  draft: { tone: "neutral", icon: CircleDashed, outline: true },
  planned: { tone: "waiting", icon: Hourglass },
  confirmed: { tone: "ok", icon: Check },
  live: { tone: "info", icon: PlayCircle },
  completed: { tone: "neutral", icon: Check },
  closed: { tone: "neutral", icon: ReceiptText },
  cancelled: { tone: "neutral", icon: X, strike: true },
} as const satisfies Record<
  string,
  { tone: Tone; icon: LucideIcon; outline?: boolean; strike?: boolean }
>;

export type EventStatus = keyof typeof EVENT_STATUS;

export const EVENT_STATUSES = Object.keys(EVENT_STATUS) as EventStatus[];

/** Booking flags shown in the event header. */
export const BOOKING_FLAG_ICONS = {
  open: Check,
  full: CircleDot,
  carsFull: Ban,
  notOpen: Clock,
} as const;
