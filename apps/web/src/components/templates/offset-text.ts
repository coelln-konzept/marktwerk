import { type DayMode, offsetLabel, offsetWords } from "@marktwerk/core";
import { useTranslations } from "next-intl";

/**
 * Offsets in the words the office uses: "6 Wochen vorher", "am Tag selbst", with the stored value as
 * "(T-42)" (R4-03). The stored value stays days; this is display only.
 */
export function useOffsetText() {
  const t = useTranslations("taskTemplates.offset");
  const words = (offsetDays: number, dayMode: DayMode = "calendar") => {
    const w = offsetWords(offsetDays, dayMode);
    if (w.kind === "on") return t("on");
    return t(w.direction, { amount: t(w.kind, { count: w.count }) });
  };
  return {
    /** "6 Wochen vorher" */
    words,
    /** "6 Wochen vorher (T-42)" */
    full: (offsetDays: number, dayMode: DayMode = "calendar") =>
      offsetDays === 0
        ? t("onFull", { t: offsetLabel(0) })
        : t("full", { words: words(offsetDays, dayMode), t: offsetLabel(offsetDays) }),
  };
}
