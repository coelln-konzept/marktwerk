import { getTranslations } from "next-intl/server";
import { BoardSkeleton } from "@/components/board/board-skeleton";
import { Page } from "@/components/shell/page";

export default async function Loading() {
  const t = await getTranslations("board");
  return (
    <Page crumbs={[{ label: t("title") }]} wide>
      <BoardSkeleton />
    </Page>
  );
}
