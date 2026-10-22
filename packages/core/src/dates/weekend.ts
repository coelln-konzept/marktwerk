import { addDays, weekday } from "./calendar";

/**
 * The weekend "Dieses Wochenende" refers to: the coming Saturday and Sunday. On a Saturday or
 * Sunday it is the current weekend (it is still happening), from Monday on the one ahead.
 */
export function upcomingWeekend(today: string): { saturday: string; sunday: string } {
  const day = weekday(today); // 0 = Sunday … 6 = Saturday
  const saturday = day === 0 ? addDays(today, -1) : addDays(today, 6 - day);
  return { saturday, sunday: addDays(saturday, 1) };
}
