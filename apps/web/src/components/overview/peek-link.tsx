import { Eye } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The visible eye next to a market on the Übersicht: opens its Vorschau (`/?vorschau=<id>`) in place, like the
 * eye in the Veranstaltungen list (handwritten notes HN-06). Rows still open it with Space too.
 */
export function PeekLink({
  eventId,
  name,
  className,
}: {
  eventId: string;
  name: string;
  className?: string;
}) {
  const t = useTranslations("events");
  return (
    <Link
      href={`/?vorschau=${eventId}` as never}
      scroll={false}
      tabIndex={-1}
      aria-label={t("preview", { name })}
      title={t("preview", { name })}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-foreground-2 hover:bg-hover hover:text-foreground",
        className,
      )}
    >
      <Eye aria-hidden className="size-4" />
    </Link>
  );
}
