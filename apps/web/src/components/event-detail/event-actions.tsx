"use client";

import { Menu } from "@base-ui/react/menu";
import type { EventStatus } from "@marktwerk/core/events/lifecycle";
import { CalendarClock, Ellipsis, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EVENT_STATUS } from "@/lib/status";
import type { VenueOption } from "@/server/queries/venues";
import type { EventBasics } from "@/server/services/event-details";
import { BasicsDialog } from "./basics-dialog";
import { MoveDialog } from "./move-dialog";
import { useStatusChange } from "./status-menu";

const item =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-hover";

/**
 * The "…" menu next to the event title: Bearbeiten, Verschieben and Status ändern in one place (UX pass
 * 2026-10-22). Every action stays reachable by keyboard (Enter/Space opens the menu, arrows move, Esc
 * closes); the dialogs open from the items and keep their own focus handling.
 */
export function EventActions({
  eventId,
  eventName,
  status,
  startsOn,
  basics,
  venues,
  canMove,
}: {
  eventId: string;
  eventName: string;
  status: EventStatus;
  startsOn: string;
  basics: EventBasics;
  venues: VenueOption[];
  canMove: boolean;
}) {
  const t = useTranslations("eventDetail");
  const tStatus = useTranslations("status.event");
  const [basicsOpen, setBasicsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const change = useStatusChange({ eventId, eventName, status });

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label={t("header.more")}
          aria-busy={change.pending}
          disabled={change.pending}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-input bg-card text-foreground-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring data-[popup-open]:bg-hover"
        >
          <Ellipsis aria-hidden className="size-4" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className="flex min-w-[220px] flex-col rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
              <Menu.Item className={item} onClick={() => setBasicsOpen(true)}>
                <Pencil aria-hidden className="size-4 text-muted-foreground" />
                {t("basics.open")}
              </Menu.Item>
              {canMove && (
                <Menu.Item className={item} onClick={() => setMoveOpen(true)}>
                  <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                  {t("move.open")}
                </Menu.Item>
              )}
              {change.targets.length > 0 && (
                <Menu.Group>
                  <Menu.GroupLabel className="px-2 pt-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                    {t("status.menu")}
                  </Menu.GroupLabel>
                  {change.targets.map((to) => {
                    const Icon = EVENT_STATUS[to].icon;
                    return (
                      <Menu.Item key={to} className={item} onClick={() => change.choose(to)}>
                        <Icon aria-hidden className="size-4 text-muted-foreground" />
                        {tStatus(to)}
                      </Menu.Item>
                    );
                  })}
                </Menu.Group>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <BasicsDialog
        eventId={eventId}
        startsOn={startsOn}
        basics={basics}
        venues={venues}
        open={basicsOpen}
        onOpenChange={setBasicsOpen}
      />
      {canMove && (
        <MoveDialog
          eventId={eventId}
          startsOn={startsOn}
          open={moveOpen}
          onOpenChange={setMoveOpen}
        />
      )}
      {change.dialog}
    </>
  );
}
