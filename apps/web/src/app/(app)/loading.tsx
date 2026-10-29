import { getTranslations } from "next-intl/server";
import { Page } from "@/components/shell/page";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/states";

/**
 * Shown at once on every navigation inside the app that has no `loading.tsx` of its own (the boards
 * do): a page title and a panel of rows, so a click is never answered by a frozen page. Fluid widths
 * only, nothing wider than the column (390 px phones).
 */
export default async function Loading() {
  const t = await getTranslations("states");
  return (
    <Page crumbs={[{ label: t("loading") }]}>
      <div className="flex flex-col gap-6" aria-busy="true">
        <p role="status" className="sr-only">
          {t("loading")}
        </p>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="w-80 max-w-full" />
        </div>
        <Panel>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <li key={row} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="w-3/5" />
                </div>
                <Skeleton className="hidden w-16 shrink-0 sm:block" />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
