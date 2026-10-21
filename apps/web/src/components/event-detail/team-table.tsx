import { UserX } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Health } from "@/components/ui/health";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import type { EventDetail } from "@/server/queries/events";
import { roleName } from "./role-name";

/** Duty roles of an event → assigned staff member (read only in M1). */
export async function TeamTable({ event }: { event: EventDetail }) {
  const t = await getTranslations("eventDetail.team");
  const tHealth = await getTranslations("health");
  const locale = await getLocale();
  const total = event.duties.length;
  const assigned = event.duties.filter((d) => d.staffMemberId).length;
  const level = event.health.team ?? "none";
  return (
    <Panel aria-labelledby="duties-title">
      <PanelHeader>
        <PanelTitle id="duties-title">{t("title")}</PanelTitle>
        <Health level={level} label={`${t("summary", { assigned, total })} · ${tHealth(level)}`} />
      </PanelHeader>
      <Table>
        <caption className="sr-only">{t("caption")}</caption>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>{t("role")}</TH>
            <TH>{t("person")}</TH>
          </TR>
        </THead>
        <tbody>
          {event.duties.map((duty) => (
            <TR key={duty.roleId}>
              <TD className="w-1/3 font-medium">{roleName(duty, locale)}</TD>
              <TD>
                {duty.staffMemberId && duty.staffName ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={duty.staffName} />
                    {duty.staffName}
                  </span>
                ) : (
                  <StatusBadge tone="warn" icon={UserX}>
                    {t("unassigned")}
                  </StatusBadge>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <PanelFooter className="text-muted-foreground text-small">{t("hint")}</PanelFooter>
    </Panel>
  );
}
