"use client";

import { useTranslations } from "next-intl";

export { SELECT_CLASS } from "@/components/venues/shared";

/** Text for an error code from the company services (or a client-side check). */
export function useErrorText() {
  const t = useTranslations("company.errors");
  return (code: string) => (t.has(code as never) ? t(code as never) : t("generic"));
}
