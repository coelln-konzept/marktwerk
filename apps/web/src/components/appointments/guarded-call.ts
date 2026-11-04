import type { AppointmentResult } from "@/app/(app)/appointment-actions";

/** An action that throws counts as a generic failure, never as a crash into the error boundary. */
export async function guardedCall(
  run: () => Promise<AppointmentResult>,
): Promise<AppointmentResult> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "generic" };
  }
}
