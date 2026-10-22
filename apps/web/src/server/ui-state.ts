import "server-only";
import { cookies } from "next/headers";
import { UI_STATE_COOKIES } from "@/lib/ui-state";

/** Reads a remembered open/closed UI state (see `lib/ui-state.ts`); closed unless the cookie says "1". */
export async function getUiState(name: keyof typeof UI_STATE_COOKIES): Promise<boolean> {
  return (await cookies()).get(UI_STATE_COOKIES[name])?.value === "1";
}
