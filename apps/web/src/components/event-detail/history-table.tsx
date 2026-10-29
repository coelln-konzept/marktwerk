import { History } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateShort } from "@/lib/format";
import type { HistoryEntry } from "@/server/queries/event-detail";
import { formatInstant } from "./format-instant";

type StatusDiff = { from?: string; to?: string; reason?: string; undo?: boolean };
type CreateDiff = { source?: string };
type DutyDiff = {
  roleDe?: string;
  roleEn?: string;
  fromName?: string | null;
  toName?: string | null;
  undo?: boolean;
};
type UpdateDiff = { changes?: Record<string, unknown>; undo?: boolean };
type BookingDiff = { flag?: string; to?: boolean };
type MoveDiff = { from?: { startsOn?: string }; to?: { startsOn?: string }; undo?: boolean };
type TaskStatusDiff = { from?: string; to?: string; reason?: string; note?: string };
type SnoozeDiff = { until?: string };

function asObject<T>(value: unknown): T {
  return (value && typeof value === "object" ? value : {}) as T;
}

/** Audit entries of one event in plain words, newest first. */
export async function HistoryTable({ entries }: { entries: HistoryEntry[] }) {
  const t = await getTranslations("eventDetail.history");
  const tStatus = await getTranslations("status.event");
  const tFlag = await getTranslations("eventDetail.booking.flag");
  const tTaskStatus = await getTranslations("tasks.status");
  const locale = await getLocale();

  const status = (key: string | undefined) =>
    key && tStatus.has(key as never) ? tStatus(key as never) : (key ?? "?");

  function describe(entry: HistoryEntry): { text: string; reason?: string } {
    switch (entry.action) {
      case "event.status": {
        const d = asObject<StatusDiff>(entry.diff);
        return {
          text: t(d.undo ? "statusUndone" : "statusChanged", {
            from: status(d.from),
            to: status(d.to),
          }),
          reason: d.reason ? t("reason", { reason: d.reason }) : undefined,
        };
      }
      case "event.create": {
        const source = asObject<CreateDiff>(entry.diff).source;
        return {
          text:
            source === "preset"
              ? t("created")
              : source === "agreement"
                ? t("createdAgreement")
                : t("createdManual"),
        };
      }
      case "event.update_notes":
        return { text: t("notes") };
      case "event.duty": {
        const d = asObject<DutyDiff>(entry.diff);
        const role = (locale === "en" ? d.roleEn : d.roleDe) ?? "?";
        const text = !d.toName
          ? t("dutyCleared", { role, name: d.fromName ?? "?" })
          : !d.fromName
            ? t("dutyAssigned", { role, name: d.toName })
            : t("dutyChanged", { role, from: d.fromName, to: d.toName });
        return { text, reason: d.undo ? t("dutyUndone") : undefined };
      }
      case "event.update": {
        const d = asObject<UpdateDiff>(entry.diff);
        const fields = Object.keys(d.changes ?? {})
          .map((key) => (t.has(`fields.${key}` as never) ? t(`fields.${key}` as never) : key))
          .join(", ");
        return { text: t("updated", { fields }), reason: d.undo ? t("undone") : undefined };
      }
      case "event.booking": {
        const d = asObject<BookingDiff>(entry.diff);
        const flag =
          d.flag && tFlag.has(d.flag as never) ? tFlag(d.flag as never) : (d.flag ?? "?");
        return { text: t(d.to ? "bookingOn" : "bookingOff", { flag }) };
      }
      case "event.move": {
        const d = asObject<MoveDiff>(entry.diff);
        const day = (date?: string) => (date ? formatDateShort(date, locale) : "?");
        return {
          text: t("moved", { from: day(d.from?.startsOn), to: day(d.to?.startsOn) }),
          reason: d.undo ? t("undone") : undefined,
        };
      }
      case "event.archive":
        return { text: t("archived") };
      case "task.status": {
        const d = asObject<TaskStatusDiff>(entry.diff);
        const title = entry.subject ?? "?";
        const reopened = d.to === "todo" && (d.from === "done" || d.from === "skipped");
        const status =
          d.to && tTaskStatus.has(d.to as never) ? tTaskStatus(d.to as never) : (d.to ?? "?");
        return {
          text:
            d.to === "done"
              ? t("taskDone", { title })
              : reopened
                ? t("taskReopened", { title })
                : t("taskStatus", { title, status }),
          reason: d.reason ? t("reason", { reason: d.reason }) : undefined,
        };
      }
      case "task.snooze": {
        const until = asObject<SnoozeDiff>(entry.diff).until;
        return {
          text: t("taskSnoozed", {
            title: entry.subject ?? "?",
            date: until ? formatDateShort(until, locale) : "?",
          }),
        };
      }
      case "task.unsnooze":
        return { text: t("taskUnsnoozed", { title: entry.subject ?? "?" }) };
      case "task.undo":
        return { text: t("taskUndone", { title: entry.subject ?? "?" }) };
      case "document.upload":
        return { text: t("documentUploaded", { file: entry.subject ?? "?" }) };
      case "document.archive":
        return { text: t("documentArchived", { file: entry.subject ?? "?" }) };
      case "document.restore":
        return { text: t("documentRestored", { file: entry.subject ?? "?" }) };
      default:
        return { text: t("other", { action: entry.action }) };
    }
  }

  return (
    <Panel aria-labelledby="history-title">
      <PanelHeader>
        <PanelTitle id="history-title">{t("title")}</PanelTitle>
      </PanelHeader>
      {entries.length === 0 ? (
        <EmptyState icon={History} title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <>
          {/* Phones: one stacked entry each (when · who, then the change); a 3-column table would
              hide the change in a side-scrolling box. */}
          <ul aria-label={t("caption")} className="m-0 flex list-none flex-col p-0 sm:hidden">
            {entries.map((entry) => {
              const { text, reason } = describe(entry);
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 border-border-subtle border-b px-4 py-2.5 last:border-b-0"
                >
                  <span className="text-foreground-2 text-small">
                    <time dateTime={entry.at.toISOString()} className="tabular">
                      {formatInstant(entry.at, locale)}
                    </time>
                    {" · "}
                    {entry.actorName ?? t("unknownActor")}
                  </span>
                  <span className="font-medium">{text}</span>
                  {reason && <span className="text-muted-foreground text-small">{reason}</span>}
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block">
            <Table>
              <caption className="sr-only">{t("caption")}</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>{t("when")}</TH>
                  <TH>{t("who")}</TH>
                  <TH>{t("what")}</TH>
                </TR>
              </THead>
              <tbody>
                {entries.map((entry) => {
                  const { text, reason } = describe(entry);
                  return (
                    <TR key={entry.id}>
                      <TD className="tabular whitespace-nowrap text-foreground-2">
                        <time dateTime={entry.at.toISOString()}>
                          {formatInstant(entry.at, locale)}
                        </time>
                      </TD>
                      <TD className="whitespace-nowrap">{entry.actorName ?? t("unknownActor")}</TD>
                      <TD>
                        <span className="font-medium">{text}</span>
                        {reason && (
                          <span className="block text-muted-foreground text-small">{reason}</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </Panel>
  );
}
