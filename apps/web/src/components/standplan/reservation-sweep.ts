"use client";

import { sweepReservations } from "@marktwerk/core";
import { useEffect, useRef } from "react";
import { appendOutgoing } from "@/components/postfach/mail-store";
import { releaseMail, reminderMail } from "./booking-mails";
import {
  prototypeToday,
  type ReleasedRecord,
  readStandplanState,
  type SentMail,
  type StoredPlacement,
  updateStandplanState,
  useStandplanStore,
} from "./store";

export const BOOKING_MAILBOX = "buchung@coelln-konzept.de";

/**
 * The daily reservation run (spec 2026-11-04 §3): reminders on the reminder day, release and
 * cancellation mail after the due date. Real build: a pg-boss job once a day. PROTOTYPE: runs whenever
 * Standplan or Postfach opens and whenever the prototype clock moves. Idempotent: a reminded
 * reservation carries `remindedOn`, a released one is gone.
 */
export function runReservationSweep(): { reminded: number; released: number } {
  const s = readStandplanState();
  const today = prototypeToday(s);
  const byId = new Map<string, { eventId: string; p: StoredPlacement }>();
  for (const [eventId, list] of Object.entries(s.placements)) {
    for (const p of list) {
      if (p.status === "reserved" && p.reservation) byId.set(p.itemId, { eventId, p });
    }
  }
  const { remind, release } = sweepReservations(
    [...byId.values()].map(({ p }) => ({
      id: p.itemId,
      dueOn: p.reservation?.dueOn ?? today,
      reminderOn: p.reservation?.reminderOn ?? null,
      remindedOn: p.reservation?.remindedOn,
      paidOn: p.reservation?.paidOn,
    })),
    today,
  );
  if (remind.length === 0 && release.length === 0) return { reminded: 0, released: 0 };

  const at = new Date().toISOString();
  const sent: SentMail[] = [];
  const released: ReleasedRecord[] = [];
  const send = (eventId: string, p: StoredPlacement, mail: { subject: string; body: string }) => {
    const r = p.reservation;
    if (!r) return;
    sent.push({
      id: `sent-${p.itemId}-${at}-${sent.length}`,
      itemId: p.itemId,
      eventId,
      toName: r.vendorName,
      toAddress: r.email,
      subject: mail.subject,
      body: mail.body,
      sentAt: at,
    });
    if (r.conversationId) {
      appendOutgoing({
        conversationId: r.conversationId,
        to: { name: r.vendorName, address: r.email },
        fromAddress: BOOKING_MAILBOX,
        subject: mail.subject,
        text: mail.body,
        authorId: "standplan",
      });
    }
  };

  for (const id of remind) {
    const hit = byId.get(id);
    if (hit?.p.reservation)
      send(hit.eventId, hit.p, reminderMail(hit.p.reservation, s.bookingSettings));
  }
  for (const id of release) {
    const hit = byId.get(id);
    const r = hit?.p.reservation;
    if (!hit || !r) continue;
    send(hit.eventId, hit.p, releaseMail(r));
    released.push({
      itemId: id,
      eventId: hit.eventId,
      stallNumber: r.stallNumber,
      reference: r.reference,
      releasedOn: today,
      reason: "unpaid",
    });
  }

  const remindSet = new Set(remind);
  const releaseSet = new Set(release);
  updateStandplanState((cur) => {
    const placements: typeof cur.placements = {};
    for (const [eventId, list] of Object.entries(cur.placements)) {
      placements[eventId] = list
        .filter((p) => !(p.status === "reserved" && releaseSet.has(p.itemId)))
        .map((p) =>
          p.status === "reserved" && p.reservation && remindSet.has(p.itemId)
            ? { ...p, reservation: { ...p.reservation, remindedOn: today } }
            : p,
        );
    }
    return {
      ...cur,
      placements,
      sent: [...sent, ...cur.sent],
      released: [...released, ...cur.released],
    };
  });
  return { reminded: remind.length, released: release.length };
}

/** Runs the sweep after mount and whenever the prototype clock changes. */
export function useReservationSweep(
  onResult?: (r: { reminded: number; released: number }) => void,
) {
  const { state } = useStandplanStore();
  const cb = useRef(onResult);
  cb.current = onResult;
  const offset = state.clockOffsetDays;
  useEffect(() => {
    // `offset` is the trigger: the sweep reads the clock from the store itself.
    void offset;
    const r = runReservationSweep();
    if (r.reminded || r.released) cb.current?.(r);
  }, [offset]);
}
