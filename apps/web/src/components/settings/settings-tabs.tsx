"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SettingsTab = { key: string; href: string; label: string };

/** Sub-navigation of Einstellungen: every tab is its own page; `aria-current="page"` and a teal underline mark the active one. */
export function SettingsTabs({ tabs, label }: { tabs: SettingsTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto border-b px-4 lg:-mx-7 lg:px-7">
      <ul className="m-0 flex min-w-max list-none gap-1 p-0">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.key}>
              <Link
                href={tab.href as never}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-10 items-center whitespace-nowrap border-b-2 px-3 text-body outline-none hover:text-foreground focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-foreground-2",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
