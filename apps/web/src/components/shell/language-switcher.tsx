"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/app/(app)/actions";
import { LOCALES } from "@/i18n/config";

export function LanguageSwitcher() {
  const t = useTranslations("language");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={t("label")}
      className="h-8 rounded-md border bg-transparent px-2 text-xs"
      value={locale}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(() => setLocale(next));
      }}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </select>
  );
}
