import { FileText, Kanban, ShieldCheck, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";

const ICONS = {
  board: Kanban,
  permits: ShieldCheck,
  money: Wallet,
  documents: FileText,
} as const;

/** Tab whose content arrives in a later milestone: says what will be here and when. */
export async function LaterTab({ kind }: { kind: keyof typeof ICONS }) {
  const t = await getTranslations("eventDetail.later");
  return (
    <Panel>
      <EmptyState icon={ICONS[kind]} title={t(`${kind}.title`)} hint={t(`${kind}.hint`)} />
    </Panel>
  );
}
