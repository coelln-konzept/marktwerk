/** Notification reasons grouped for the filter chips of the notification centre. */
export const NOTIFICATION_GROUPS = [
  "assigned",
  "mentioned",
  "deadlines",
  "escalated",
  "changes",
] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const NOTIFICATION_REASON_GROUPS: Record<NotificationGroup, readonly string[]> = {
  assigned: ["assigned"],
  mentioned: ["mentioned"],
  deadlines: [
    "due_soon",
    "overdue",
    "rolled_over",
    "permit_apply_by",
    "permit_decision_due",
    "installment_due",
    "rental_return_due",
    "obligation_due",
    "hours_missing",
    "payroll_close",
  ],
  escalated: ["escalated"],
  changes: ["dates_shifted", "shift_request"],
};

export function isNotificationGroup(value: string | undefined): value is NotificationGroup {
  return (NOTIFICATION_GROUPS as readonly string[]).includes(value ?? "");
}

/** "Später" choices; the server turns them into a time (company time zone). */
export const SNOOZE_CHOICES = ["hour", "tomorrow", "next_week"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];
