import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BoardScreen } from "@/components/board/board-screen";
import { Page, PageHeader } from "@/components/shell/page";
import { getActor } from "@/server/actor";
import { requirePermission } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("board") };
}

/** Board across all events: Bereitschaft (default), Matrix and Spalten (plus person and workload views with the team module). */
export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await requirePermission("task", "read");
  const actor = await getActor();
  const t = await getTranslations("board");
  return (
    <Page crumbs={[{ label: t("title") }]} wide>
      <PageHeader title={t("title")} />
      <BoardScreen path="/board" searchParams={await searchParams} actor={actor} />
    </Page>
  );
}
