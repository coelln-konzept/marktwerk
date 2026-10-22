import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Drawer } from "@/components/ui/drawer";
import { hrefWith } from "@/lib/url";
import type { Actor } from "@/server/actor";
import { pastEventCleanup } from "@/server/queries/tasks";
import { CleanupList } from "./cleanup-list";

/**
 * One calm line under the lists when open tasks of past markets exist (they are in none of the lists or
 * KPIs). "Aufräumen" opens the cleanup view at `?aufraeumen=1`. Plain text for people who may not edit tasks.
 */
export async function PastMarketsLine({
  count,
  query,
  canCleanup,
}: {
  count: number;
  query: Record<string, string | string[] | undefined>;
  canCleanup: boolean;
}) {
  if (count === 0) return null;
  const t = await getTranslations("overview.cleanup");
  return (
    <p className="m-0 px-1 text-muted-foreground text-small">
      {t("line", { count })}
      {canCleanup && (
        <>
          {" · "}
          <Link
            href={hrefWith("/", query, { aufraeumen: "1", vorschau: undefined }) as never}
            scroll={false}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {t("action")}
          </Link>
        </>
      )}
    </p>
  );
}

/** The cleanup view as a drawer on the Übersicht (`?aufraeumen=1`, linkable). */
export async function PastMarketsDrawer({
  actor,
  today,
  query,
}: {
  actor: Actor;
  today: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations("overview.cleanup");
  const { events } = await pastEventCleanup(actor, today);
  return (
    <Drawer
      kind={t("kind")}
      title={t("title")}
      closeHref={hrefWith("/", query, { aufraeumen: undefined })}
    >
      <p className="m-0 text-muted-foreground text-small">{t("intro")}</p>
      <CleanupList events={events} />
    </Drawer>
  );
}
