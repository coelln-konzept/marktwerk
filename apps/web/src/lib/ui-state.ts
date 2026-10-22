/**
 * Small per-browser UI states that the server reads to render the right initial markup (no flash):
 * the collapsed "Stammdaten" group of the sidebar and the Kalender "Ebenen" panel. Cookies, not user
 * data: they are shell preferences, written by the client on toggle and read with `cookies()`.
 */
export const UI_STATE_COOKIES = {
  /** "1" = the Stammdaten group of the sidebar is open (default: collapsed). */
  navMasterData: "mw_nav_stammdaten",
  /** "1" = the Kalender "Ebenen" panel is open (default: collapsed). */
  calendarLayers: "mw_kal_ebenen",
} as const;

/** Client only: remembers a UI state for a year. */
export function writeUiState(name: string, open: boolean): void {
  // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not available in every supported browser
  document.cookie = `${name}=${open ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}
