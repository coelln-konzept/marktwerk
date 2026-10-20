import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function Forbidden() {
  const t = await getTranslations("errors");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-medium">{t("forbidden")}</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        {t("back")}
      </Link>
    </main>
  );
}
