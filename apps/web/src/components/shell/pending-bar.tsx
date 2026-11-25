"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ACTION_EVENTS } from "@/lib/call-action";
import { navTarget } from "./nav-target";

/** Fast answers show nothing; the bar appears only when a click is not answered at once. */
const SHOW_AFTER_MS = 200;
/** Screen readers hear "Lädt …" / "Wird gespeichert …" only when it really takes a while. */
const SAY_AFTER_MS = 1500;
/** A click that never led anywhere (the row ignored it) must not keep the bar forever. */
const GIVE_UP_MS = 15_000;

type Phase = "idle" | "start" | "run" | "done";

/**
 * A thin bar at the top edge while a page loads after a click or a server action is still running
 * (UX-063: the old page used to stay put with no sign that anything happens). Starts on a click on an
 * in-app link or row and ends when the URL changes; actions report through `callAction`.
 */
export function PendingBar() {
  const t = useTranslations("states");
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [navigating, setNavigating] = useState(false);
  const [actions, setActions] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [say, setSay] = useState(false);
  const busy = navigating || actions > 0;

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Offline, the click is stopped (`ConnectionGuard`) and nothing loads.
      if (navigator.onLine && navTarget(event)) setNavigating(true);
    }
    const start = () => setActions((n) => n + 1);
    const end = () => setActions((n) => Math.max(0, n - 1));
    window.addEventListener("click", onClick, true);
    window.addEventListener(ACTION_EVENTS.start, start);
    window.addEventListener(ACTION_EVENTS.end, end);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener(ACTION_EVENTS.start, start);
      window.removeEventListener(ACTION_EVENTS.end, end);
    };
  }, []);

  // The new page (or the drawer, the filter) is there: navigation done.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on URL change only
  useEffect(() => setNavigating(false), [pathname, search]);

  useEffect(() => {
    if (!navigating) return;
    const timer = setTimeout(() => setNavigating(false), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [navigating]);

  useEffect(() => {
    if (busy) {
      const show = setTimeout(() => {
        setPhase("start");
        // One frame at 0 %, then the slow run towards 85 %.
        requestAnimationFrame(() => requestAnimationFrame(() => setPhase("run")));
      }, SHOW_AFTER_MS);
      const speak = setTimeout(() => setSay(true), SAY_AFTER_MS);
      return () => {
        clearTimeout(show);
        clearTimeout(speak);
      };
    }
    setSay(false);
    setPhase((current) => (current === "idle" ? current : "done"));
    const reset = setTimeout(() => setPhase("idle"), 400);
    return () => clearTimeout(reset);
  }, [busy]);

  const width = phase === "run" ? "85%" : phase === "done" ? "100%" : "0%";
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5">
        {phase !== "idle" && (
          <div
            data-pending-bar
            className="h-full bg-primary"
            style={{
              width,
              opacity: phase === "done" ? 0 : 1,
              transition:
                phase === "run"
                  ? "width 8s cubic-bezier(0.1, 0.7, 0.2, 1)"
                  : phase === "done"
                    ? "width 150ms ease-out, opacity 300ms ease-out 100ms"
                    : "none",
            }}
          />
        )}
      </div>
      <p role="status" className="sr-only">
        {say ? (actions > 0 ? t("saving") : t("loading")) : null}
      </p>
    </>
  );
}
