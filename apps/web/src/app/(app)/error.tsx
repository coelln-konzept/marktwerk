"use client";

import { TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useOnline } from "@/components/shell/connection-guard";
import { Topbar } from "@/components/shell/topbar";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";

/**
 * Anything that throws while a page renders or a transition runs lands here instead of on Next's
 * English "This page couldn't load": the sidebar stays, so the way out is one click. The shell
 * (layout) is not wrapped by this boundary; `global-error.tsx` covers the layout itself. Offline, it
 * says so (not "etwas schiefgelaufen") and tries again by itself once the connection is back (UX-007).
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors");
  const online = useOnline();
  useEffect(() => {
    console.error(error);
  }, [error]);
  useEffect(() => {
    if (!online) {
      const retryOnline = () => retry();
      window.addEventListener("online", retryOnline, { once: true });
      return () => window.removeEventListener("online", retryOnline);
    }
  }, [online, retry]);
  const title = online ? t("failedTitle") : t("offlineTitle");
  return (
    <>
      <Topbar crumbs={[{ label: title }]} />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 lg:px-7">
        <h1 className="font-semibold text-[22px] tracking-tight">{title}</h1>
        <Panel role="alert">
          <EmptyState
            icon={online ? TriangleAlert : WifiOff}
            tone="critical"
            title={online ? t("failedHint") : t("offlineHint")}
          >
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {t("retry")}
            </button>
            <Link
              href="/"
              className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
            >
              {t("back")}
            </Link>
          </EmptyState>
        </Panel>
      </div>
    </>
  );
}
