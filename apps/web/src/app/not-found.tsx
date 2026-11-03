import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Unknown address outside the app (a mistyped bookmark): no shell, just the way back. */
export async function generateMetadata() {
  const t = await getTranslations("errors");
  return { title: t("notFoundTitle") };
}

export default async function RootNotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-semibold text-[22px] tracking-tight">{t("notFoundTitle")}</h1>
      <p className="max-w-[48ch] text-muted-foreground">{t("notFoundHint")}</p>
      <Link
        href="/"
        className="inline-flex min-h-8 items-center rounded-lg border border-input bg-card px-3 font-medium hover:bg-hover"
      >
        {t("back")}
      </Link>
    </main>
  );
}
