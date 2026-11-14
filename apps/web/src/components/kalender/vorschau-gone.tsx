import { CircleSlash } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Vorschau } from "@/components/ui/vorschau";

/**
 * The Vorschau of a link to an event or a Besprechung that no longer exists (deleted, archived, or a wrong
 * id): it says so instead of failing silently (UX-072). Closing it removes `vorschau` from the URL.
 */
export async function VorschauGone({ kind, closeHref }: { kind: string; closeHref: string }) {
  const t = await getTranslations("kalenderPage.gone");
  return (
    <Vorschau kind={kind} title={t("title")} closeHref={closeHref}>
      <p className="m-0 flex items-start gap-2 text-muted-foreground text-small">
        <CircleSlash aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("text")}
      </p>
    </Vorschau>
  );
}
