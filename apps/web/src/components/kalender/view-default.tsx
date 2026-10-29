"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { KAL_PHONE_COOKIE } from "./layers";

/** Phone widths are everything below Tailwind's `md` (768 px). */
const PHONE = "(max-width: 767.98px)";

/**
 * Keeps the "phone-sized viewport" cookie in step with the real width, for the Kalender's default view
 * (decision 2026-10-28: phones open in Liste, wider screens in Monat; an explicit `?ansicht=` always
 * wins). The server cannot see the width, so it reads the cookie. Rendered only while no `ansicht` is in
 * the URL. First visit or a changed width class: write the cookie and refresh the page once (the server
 * then renders the other view); from then on the server picks the right view without any flash and
 * without fetching both views.
 */
export function ViewDefault({ assumedPhone, known }: { assumedPhone: boolean; known: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    function sync() {
      const phone = query.matches;
      if (known && phone === assumedPhone) return;
      // biome-ignore lint/suspicious/noDocumentCookie: cookieStore is not available in every supported browser
      document.cookie = `${KAL_PHONE_COOKIE}=${phone ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      if (phone !== assumedPhone) router.refresh();
    }
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [assumedPhone, known, router]);
  return null;
}
