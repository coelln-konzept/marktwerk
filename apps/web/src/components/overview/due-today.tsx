import { CalendarCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";

const FILTERS = [
  { key: "all", milestone: null },
  { key: "money", milestone: "M5" },
  { key: "permits", milestone: "M3" },
  { key: "hours", milestone: "M4" },
  { key: "tasks", milestone: "M2" },
] as const;

/**
 * "Heute fällig" in the prototype's shape. The list itself fills from M2 (tasks), M3 (permits),
 * M4 (hours) and M5 (money), so the chips are shown but disabled until then.
 */
export async function DueToday() {
  const t = await getTranslations("overview.due");
  return (
    <Panel aria-labelledby="due-title">
      <PanelHeader>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <PanelTitle id="due-title">{t("title")}</PanelTitle>
          <span className="text-muted-foreground text-small">{t("subtitle")}</span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of disabled chips, not form controls */}
        <div role="group" aria-label={t("filters")} className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              disabled
              aria-current={f.key === "all" ? "true" : undefined}
              title={f.milestone ? t("soon", { milestone: f.milestone }) : undefined}
              className="inline-flex min-h-8 cursor-not-allowed items-center gap-2 whitespace-nowrap rounded-full border border-input bg-card px-3 font-medium text-small opacity-60 aria-[current=true]:border-foreground aria-[current=true]:bg-foreground aria-[current=true]:text-background"
            >
              {t(`filter.${f.key}`)}
              <span className="tabular inline-grid h-5 min-w-5 place-items-center rounded-full bg-status-neutral-bg px-1 font-semibold text-[11.5px] text-foreground-2 in-aria-[current=true]:bg-white/20 in-aria-[current=true]:text-inherit">
                0
              </span>
            </button>
          ))}
        </div>
      </PanelHeader>
      <EmptyState icon={CalendarCheck} title={t("emptyTitle")} hint={t("emptyHint")} />
    </Panel>
  );
}
