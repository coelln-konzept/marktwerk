"use client";

import { CalendarClock, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useOpenOnNew } from "@/components/shell/use-new-param";
import { Button } from "@/components/ui/button";
import { Panel, PanelFooter, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { ShiftDialog } from "./shift-dialog";
import { ShiftRowEditor } from "./shift-row";
import type { ShiftEnvironment, ShiftView } from "./shift-types";

/**
 * A list of shifts with quick entry of the actual times and "Schicht hinzufügen". Used on the
 * event's Team tab (`fixedEventId`) and on the Schichten page (one panel per event, one for office hours).
 */
export function ShiftsPanel({
  id,
  title,
  meta,
  shifts,
  env,
  fixedEventId,
  defaultDate,
  defaultPersonId,
  showDates,
  headerExtra,
  openOnNew = false,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  shifts: ShiftView[];
  env: ShiftEnvironment;
  fixedEventId?: string;
  defaultDate: string;
  defaultPersonId?: string;
  showDates: boolean;
  headerExtra?: React.ReactNode;
  /** Opens "Schicht hinzufügen" when the page is called with ?neu=1 ("+ Neu › Schicht"). */
  openOnNew?: boolean;
}) {
  const t = useTranslations("hours.shift");
  const [dialog, setDialog] = useState<{ shift: ShiftView | null; n: number } | null>(null);
  const open = (shift: ShiftView | null) => setDialog((prev) => ({ shift, n: (prev?.n ?? 0) + 1 }));
  useOpenOnNew(() => open(null), openOnNew && env.canManage);

  return (
    <Panel aria-labelledby={id}>
      <PanelHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <PanelTitle id={id}>{title}</PanelTitle>
          {meta && <p className="m-0 text-muted-foreground text-small">{meta}</p>}
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          {env.canManage && (
            <Button size="sm" onClick={() => open(null)}>
              <Plus aria-hidden />
              {t("add")}
            </Button>
          )}
        </div>
      </PanelHeader>
      {shifts.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t("empty")}
          hint={env.canManage ? t("emptyHint") : undefined}
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {shifts.map((s) => (
            <ShiftRowEditor
              key={`${s.id}-${s.version}-${s.recordedAt ?? ""}-${s.status}`}
              shift={s}
              env={env}
              showDate={showDates}
              onEdit={open}
            />
          ))}
        </ul>
      )}
      {env.canManage && shifts.length > 0 && (
        <PanelFooter className="justify-between">
          <span className="text-faint-foreground text-tiny">{t("footer")}</span>
        </PanelFooter>
      )}
      {dialog && (
        <ShiftDialog
          key={dialog.n}
          open
          onOpenChange={(next) => !next && setDialog(null)}
          env={env}
          shift={dialog.shift}
          fixedEventId={fixedEventId}
          defaults={{ workDate: defaultDate, staffMemberId: defaultPersonId }}
        />
      )}
    </Panel>
  );
}
