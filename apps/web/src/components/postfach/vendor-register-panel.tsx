"use client";

import { UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMailStore } from "./mail-store";

/**
 * PROTOTYPE: vendors added to the list because their stall was confirmed in the Standplan. Simulated in
 * this browser; the real build inserts them into the vendor table (then they appear in the list below).
 */
export function VendorRegisterPanel() {
  const t = useTranslations("postfach.register");
  const locale = useLocale();
  const { state } = useMailStore();
  const list = [...state.vendorRegister].sort((a, b) =>
    b.registeredAt.localeCompare(a.registeredAt),
  );
  if (list.length === 0) return null;
  return (
    <section
      aria-labelledby="register-title"
      className="rounded-xl border border-status-info-dot/50 bg-status-info-bg/40 p-4"
    >
      <h2 id="register-title" className="flex items-center gap-2 font-semibold text-small">
        <UserPlus className="size-4" />
        {t("title", { count: list.length })}
      </h2>
      <p className="mt-0.5 text-muted-foreground text-tiny">{t("hint")}</p>
      <ul className="mt-2 divide-y text-small">
        {list.map((v) => (
          <li key={v.email} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
            <span className="font-medium">{v.companyName ?? v.name}</span>
            <span className="text-muted-foreground">{v.email}</span>
            <span className="text-muted-foreground">
              {v.kind === "commercial" ? t("commercial") : t("private")}
            </span>
            <span className="ml-auto text-faint-foreground text-tiny">
              {t("since", {
                date: new Date(v.registeredAt).toLocaleDateString(
                  locale === "de" ? "de-DE" : "en-GB",
                ),
                refs: v.requestRefs.join(", "),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
