"use client";

import type { NoFitReason } from "@marktwerk/core";
import { useLocale, useTranslations } from "next-intl";
import { formatLength } from "@/lib/format";

type Group = { reason: NoFitReason; rowLabels: string[] };

/** Merges groups of the same kind (e.g. "no gap" with different sizes) into one line each. */
export function mergeReasons(groups: Group[]): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const same = out.find((o) => o.reason.kind === g.reason.kind);
    if (!same) {
      out.push({ reason: { ...g.reason }, rowLabels: [...g.rowLabels] });
      continue;
    }
    same.rowLabels.push(...g.rowLabels);
    if ("largestGapCm" in same.reason && "largestGapCm" in g.reason) {
      same.reason.largestGapCm = Math.max(same.reason.largestGapCm, g.reason.largestGapCm);
    }
  }
  return out;
}

/** Human-readable reasons ("Reihe A, C: keine Autos erlaubt"). */
export function useWhy() {
  const t = useTranslations("standplan.why");
  const locale = useLocale();
  const one = (reason: NoFitReason): string => {
    switch (reason.kind) {
      case "no_power":
        return t("noPower");
      case "car_not_allowed":
        return t("carNotAllowed");
      case "car_slots_full":
        return t("carSlotsFull", { slots: reason.slots });
      case "too_long":
        return t("tooLong", { length: formatLength(reason.rowLengthCm, locale) });
      case "no_gap":
        return reason.largestGapCm > 0
          ? t("noGap", { gap: formatLength(reason.largestGapCm, locale) })
          : t("rowFull");
      case "gap_rule":
        return t("gapRule");
    }
  };
  const line = (g: Group) =>
    t("line", { rows: g.rowLabels.join(", "), count: g.rowLabels.length, why: one(g.reason) });
  /** A practical next step for the dominant reason. */
  const hint = (groups: Group[]): string | null => {
    const kinds = new Set(groups.map((g) => g.reason.kind));
    if (kinds.has("car_slots_full") || kinds.has("car_not_allowed")) return t("hintCar");
    if (kinds.has("gap_rule")) return t("hintGapRule");
    if (kinds.has("no_power")) return t("hintPower");
    if (kinds.has("no_gap") || kinds.has("too_long")) return t("hintSpace");
    return null;
  };
  return { one, line, hint };
}
