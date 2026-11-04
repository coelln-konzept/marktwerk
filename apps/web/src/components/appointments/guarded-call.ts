import type { TerminResult } from "@/app/(app)/termin-actions";

/** An action that throws counts as a generic failure, never as a crash into the error boundary. */
export async function guardedCall(run: () => Promise<TerminResult>): Promise<TerminResult> {
  try {
    return await run();
  } catch {
    return { ok: false, error: "generic" };
  }
}
