import type * as React from "react";
import { Suspense } from "react";
import { isModuleVisible } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { BellFallback, NotificationBell } from "./notification-bell";
import { type Crumb, Topbar } from "./topbar";

/**
 * Every page: top bar, then the content column. The breadcrumb only shows below a top-level page (a
 * single crumb would just repeat the H1); the notification bell only while notifications are visible.
 */
export function Page({
  crumbs,
  children,
  className,
  wide,
}: {
  crumbs: Crumb[];
  children: React.ReactNode;
  className?: string;
  /** Use the full width (boards, grids, calendars). */
  wide?: boolean;
}) {
  return (
    <>
      <Topbar
        crumbs={crumbs}
        bell={
          isModuleVisible("notifications") ? (
            <Suspense fallback={<BellFallback />}>
              <NotificationBell />
            </Suspense>
          ) : undefined
        }
      />
      <div
        className={cn(
          "flex flex-col gap-6 px-4 py-6 lg:px-7",
          !wide && "mx-auto w-full max-w-[1400px]",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

/** Page heading with an optional subtitle and actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-muted-foreground text-small">{eyebrow}</p>}
        <h1 className="font-semibold text-[22px] tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground text-small">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
