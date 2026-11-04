"use client";

import { extractSignatureFields, parseSpotPreference } from "@marktwerk/core";
import {
  FileCheck2,
  FolderInput,
  History,
  MapPinned,
  Paperclip,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { type StandplanState, updateStandplanState } from "@/components/standplan/store";
import type { BookingItem, StandplanData } from "@/components/standplan/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateWithWeekday, todayIn } from "@/lib/format";
import { itemsOfConversation } from "./context";
import { knownSender, logAction, patchConversation, useMailStore } from "./mail-store";
import type { ActionEntry, Attachment, Conversation, MailDemo, Message } from "./types";

type Dialog =
  | { kind: "contact" }
  | { kind: "vendor" }
  | { kind: "stall" }
  | { kind: "permit"; att: Attachment }
  | { kind: "venue"; att: Attachment }
  | null;

/**
 * Workflow actions on a conversation (spec §7). Every action is a dialog pre-filled from the mail and one
 * deliberate click (ADR 0014). Contact, vendor, permit and location filing are SIMULATED in this
 * prototype; the stall request really lands in the Standplan (both live in this browser).
 */
export function ActionsPanel({
  demo,
  plan,
  standplan,
  conversation,
  messages,
  actions,
}: {
  demo: MailDemo;
  plan: StandplanData;
  standplan: StandplanState;
  conversation: Conversation;
  messages: Message[];
  actions: ActionEntry[];
}) {
  const t = useTranslations("postfach.actions");
  const locale = useLocale();
  const { showToast } = useShell();
  const { state, update } = useMailStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const sender = knownSender(demo, state, conversation.external.address);
  const lastIncoming = [...messages].reverse().find((m) => m.kind === "incoming");
  const isForm = messages.some((m) => m.parse?.kind === "request");
  const manual = itemsOfConversation(standplan.manualItems, conversation.id);
  const formItems = itemsOfConversation(plan.items, conversation.id);
  const attachments = messages.flatMap((m) => m.attachments);
  const ev = plan.events.find((e) => e.id === conversation.eventId);
  const person = (id: string) => demo.people.find((p) => p.id === id)?.name ?? "";

  const log = (
    kind: ActionEntry["kind"],
    summary: string,
    extra?: (s: typeof state) => typeof state,
  ) => {
    update((s) => {
      const next = logAction(s, {
        conversationId: conversation.id,
        kind,
        summary,
        authorId: demo.me.id,
      });
      return extra ? extra(next) : next;
    });
    showToast({ message: summary });
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-4 text-small">
      {/* 1. Sender */}
      <Block title={t("sender.title")}>
        <p className="font-medium">{conversation.external.name || conversation.external.address}</p>
        <p className="text-muted-foreground text-tiny">{conversation.external.address}</p>
        {sender ? (
          <p className="mt-1 flex items-center gap-1.5 text-status-ok">
            <UserCheck className="size-4" />
            {sender.id && !sender.simulated ? (
              <Link
                href={
                  (sender.kind === "contact"
                    ? `/kontakte/${sender.id}`
                    : `/aussteller?q=${encodeURIComponent(conversation.external.address)}`) as Route
                }
                className="underline-offset-4 hover:underline"
              >
                {t(`sender.known.${sender.kind}`, { label: sender.label })}
              </Link>
            ) : (
              <span>{t(`sender.known.${sender.kind}`, { label: sender.label })}</span>
            )}
            {sender.simulated && (
              <span className="text-faint-foreground text-tiny">{t("simulated")}</span>
            )}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            <p className="w-full text-muted-foreground text-tiny">{t("sender.unknown")}</p>
            <Button size="sm" onClick={() => setDialog({ kind: "contact" })}>
              <UserPlus />
              {t("sender.asContact")}
            </Button>
            <Button size="sm" onClick={() => setDialog({ kind: "vendor" })}>
              <UserPlus />
              {t("sender.asVendor")}
            </Button>
          </div>
        )}
      </Block>

      {/* 2. Stall request */}
      {(isForm || conversation.mailboxId === "buchung" || manual.length > 0) && (
        <Block title={t("stall.title")}>
          {[...formItems, ...manual].map((item) => {
            const e = plan.events.find((x) => x.id === item.eventId);
            return (
              <p key={item.id} className="flex items-center gap-2">
                <MapPinned className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {e ? `${formatDateWithWeekday(e.startsOn, locale)} · ${e.name}` : ""}
                </span>
                <Link
                  href={`/standplan?veranstaltung=${item.eventId}` as Route}
                  className="text-accent-soft-foreground underline-offset-4 hover:underline"
                >
                  {t("stall.openPlan")}
                </Link>
              </p>
            );
          })}
          {!isForm && (
            <Button size="sm" className="mt-2" onClick={() => setDialog({ kind: "stall" })}>
              <MapPinned />
              {t("stall.capture")}
            </Button>
          )}
        </Block>
      )}

      {/* 3. Attachments */}
      {attachments.length > 0 && (
        <Block title={t("attachments.title")}>
          <ul className="flex flex-col gap-2">
            {attachments.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-md border p-2">
                <a
                  href={a.dataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate">{a.name}</span>
                </a>
                {state.filed[a.id] ? (
                  <p className="text-status-ok text-tiny">{state.filed[a.id]}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setDialog({ kind: "permit", att: a })}>
                      <FileCheck2 />
                      {t("attachments.asPermit")}
                    </Button>
                    <Button size="sm" onClick={() => setDialog({ kind: "venue", att: a })}>
                      <FolderInput />
                      {t("attachments.toVenue")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* 4. Linked + history */}
      <Block title={t("linked.title")}>
        <p>
          {ev ? `${formatDateWithWeekday(ev.startsOn, locale)} · ${ev.name}` : t("linked.none")}
        </p>
        <h4 className="mt-3 flex items-center gap-1.5 font-medium text-muted-foreground text-tiny uppercase tracking-wide">
          <History className="size-3.5" />
          {t("linked.history")}
        </h4>
        {actions.length === 0 ? (
          <p className="text-faint-foreground text-tiny">{t("linked.noHistory")}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {actions.map((a) => (
              <li key={a.id} className="text-tiny">
                <span>{a.summary}</span>{" "}
                <span className="text-faint-foreground">
                  · {person(a.authorId)} ·{" "}
                  {new Date(a.at).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {dialog?.kind === "contact" && (
        <ContactDialog
          name={conversation.external.name}
          address={conversation.external.address}
          text={lastIncoming?.text ?? ""}
          onClose={() => setDialog(null)}
          onSave={(label, kind) =>
            log(
              "contact",
              t("log.contact", { name: label, kind: t(`contactKind.${kind}`) }),
              (s) => ({
                ...s,
                knownSenders: [
                  ...s.knownSenders,
                  {
                    address: conversation.external.address.toLowerCase(),
                    kind: "contact",
                    label,
                    simulated: true,
                  },
                ],
              }),
            )
          }
        />
      )}
      {dialog?.kind === "vendor" && (
        <VendorDialog
          name={conversation.external.name}
          address={conversation.external.address}
          onClose={() => setDialog(null)}
          onSave={(label) =>
            log("vendor", t("log.vendor", { name: label }), (s) => ({
              ...s,
              knownSenders: [
                ...s.knownSenders,
                {
                  address: conversation.external.address.toLowerCase(),
                  kind: "vendor",
                  label,
                  simulated: true,
                },
              ],
            }))
          }
        />
      )}
      {dialog?.kind === "stall" && (
        <StallDialog
          plan={plan}
          conversation={conversation}
          text={lastIncoming?.text ?? ""}
          knownVendor={sender?.kind === "vendor"}
          onClose={() => setDialog(null)}
          onSave={(item) => {
            updateStandplanState((s) => ({ ...s, manualItems: [...s.manualItems, item] }));
            const e = plan.events.find((x) => x.id === item.eventId);
            log(
              "stallRequest",
              t("log.stall", { event: e?.name ?? "", length: item.lengthCm / 100 }),
              (s) =>
                conversation.eventId
                  ? s
                  : patchConversation(s, conversation.id, { eventId: item.eventId }),
            );
          }}
        />
      )}
      {dialog?.kind === "permit" && (
        <PermitDialog
          demo={demo}
          plan={plan}
          att={dialog.att}
          defaultEventId={conversation.eventId}
          onClose={() => setDialog(null)}
          onSave={(label) =>
            log("permit", t("log.permit", { file: dialog.att.name, label }), (s) => ({
              ...s,
              filed: { ...s.filed, [dialog.att.id]: t("filed", { label }) },
            }))
          }
        />
      )}
      {dialog?.kind === "venue" && (
        <VenueDialog
          demo={demo}
          plan={plan}
          att={dialog.att}
          defaultEventId={conversation.eventId}
          onClose={() => setDialog(null)}
          onSave={(label) =>
            log("venueDocument", t("log.venue", { file: dialog.att.name, label }), (s) => ({
              ...s,
              filed: { ...s.filed, [dialog.att.id]: t("filed", { label }) },
            }))
          }
        />
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-3">
      <h3 className="mb-2 font-medium text-muted-foreground text-tiny uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: wraps a custom Input/NativeSelect control
    <label className="flex flex-col gap-1 text-small">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SimDialog({
  title,
  onClose,
  onSave,
  saveLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("postfach.actions");
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={title} closeLabel={t("close")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        {children}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="submit" variant="default">
            {saveLabel ?? t("saveSimulated")}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          {!saveLabel && (
            <span className="ml-auto text-faint-foreground text-tiny">{t("simulatedNote")}</span>
          )}
        </div>
      </form>
    </Modal>
  );
}

const CONTACT_KINDS = ["authority", "landowner", "supplier", "service", "other"] as const;

function ContactDialog({
  name,
  address,
  text,
  onClose,
  onSave,
}: {
  name: string;
  address: string;
  text: string;
  onClose: () => void;
  onSave: (label: string, kind: (typeof CONTACT_KINDS)[number]) => void;
}) {
  const t = useTranslations("postfach.actions");
  const f = extractSignatureFields(text);
  const [kind, setKind] = useState<(typeof CONTACT_KINDS)[number]>(
    f.company ? "supplier" : "other",
  );
  const [org, setOrg] = useState(f.company ?? name);
  const [person, setPerson] = useState(f.company ? name : "");
  const [email, setEmail] = useState(address);
  const [phone, setPhone] = useState(f.phone ?? "");
  const [street, setStreet] = useState(f.street ?? "");
  const [city, setCity] = useState(f.postalCity ?? "");
  return (
    <SimDialog
      title={t("contact.title")}
      onClose={onClose}
      onSave={() => onSave(org || name, kind)}
    >
      <p className="text-muted-foreground text-tiny">{t("contact.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("contact.kind")}>
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {CONTACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`contactKind.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("contact.name")}>
          <Input value={org} onChange={(e) => setOrg(e.target.value)} required />
        </Field>
        <Field label={t("contact.person")}>
          <Input value={person} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        <Field label={t("contact.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("contact.phone")}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("contact.street")}>
          <Input value={street} onChange={(e) => setStreet(e.target.value)} />
        </Field>
        <Field label={t("contact.city")}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </div>
    </SimDialog>
  );
}

function VendorDialog({
  name,
  address,
  onClose,
  onSave,
}: {
  name: string;
  address: string;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const t = useTranslations("postfach.actions");
  const [kind, setKind] = useState<"private" | "commercial">("private");
  const [n, setN] = useState(name);
  const [email, setEmail] = useState(address);
  return (
    <SimDialog title={t("vendor.title")} onClose={onClose} onSave={() => onSave(n)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("vendor.kind")}>
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="private">{t("vendor.private")}</option>
            <option value="commercial">{t("vendor.commercial")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("vendor.name")}>
          <Input value={n} onChange={(e) => setN(e.target.value)} required />
        </Field>
        <Field label={t("vendor.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
    </SimDialog>
  );
}

function StallDialog({
  plan,
  conversation,
  text,
  knownVendor,
  onClose,
  onSave,
}: {
  plan: StandplanData;
  /** Sender is already a vendor (database or confirmed earlier in this prototype). */
  knownVendor: boolean;
  conversation: Conversation;
  text: string;
  onClose: () => void;
  onSave: (item: BookingItem) => void;
}) {
  const t = useTranslations("postfach.actions");
  const locale = useLocale();
  const events = plan.events.filter((e) => plan.venues.some((v) => v.id === e.venueId));
  const guessMetres = /(\d+(?:[.,]\d+)?)\s*(?:m\b|meter)/i.exec(text)?.[1];
  const [eventId, setEventId] = useState(conversation.eventId ?? events[0]?.id ?? "");
  const [length, setLength] = useState(guessMetres ? guessMetres.replace(",", ".") : "3");
  // Fixed rules (ADR 0014): a vehicle is mentioned and not negated ("ohne Auto", "parken woanders").
  const [car, setCar] = useState(
    /\b(auto|bulli|sprinter|transporter|fahrzeug|pkw)\b/i.test(text) &&
      !/\b(ohne|kein(en)?)\s+(auto|fahrzeug)|woanders|parkplatz/i.test(text),
  );
  const [power, setPower] = useState(/\bstrom/i.test(text));
  const [spot, setSpot] = useState("");
  const [note, setNote] = useState(text.replace(/\s+/g, " ").slice(0, 300));
  const lengthCm = Math.round(Number(length) * 100);
  return (
    <SimDialog
      title={t("stall.dialogTitle")}
      saveLabel={t("stall.save")}
      onClose={onClose}
      onSave={() => {
        if (!eventId || !Number.isFinite(lengthCm) || lengthCm <= 0) return;
        const pref = parseSpotPreference(spot);
        onSave({
          id: `${conversation.id}:${eventId}`,
          mailId: conversation.id,
          eventId,
          vendorName: conversation.external.name || conversation.external.address,
          companyName: null,
          email: conversation.external.address,
          phone: null,
          kind: "private",
          lengthCm,
          carRequested: car,
          carLengthCm: car ? 500 : null,
          power,
          categories: [],
          preferredRowLabel: pref?.rowLabel ?? null,
          preferredOffsetCm: pref?.offsetCm ?? null,
          preferredRaw: pref?.raw ?? null,
          note: note || null,
          receivedAt: new Date().toISOString(),
          requestRef: `MAIL-${todayIn().replace(/-/g, "")}-${conversation.id.slice(-4)}`,
          knownVendor,
        });
      }}
    >
      <p className="text-muted-foreground text-tiny">{t("stall.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("stall.event")}>
          <NativeSelect value={eventId} onChange={(e) => setEventId(e.target.value)} required>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatDateWithWeekday(e.startsOn, locale)} · {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("stall.length")}>
          <Input
            type="number"
            min={1}
            step={0.5}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            required
          />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={car} onChange={(e) => setCar(e.target.checked)} />
          {t("stall.car")}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={power} onChange={(e) => setPower(e.target.checked)} />
          {t("stall.power")}
        </label>
        <Field label={t("stall.spot")}>
          <Input
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            placeholder={t("stall.spotPlaceholder")}
          />
        </Field>
      </div>
      <Field label={t("stall.note")}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="rounded-lg border border-input bg-card px-3 py-2 text-small"
        />
      </Field>
    </SimDialog>
  );
}

function PermitDialog({
  demo,
  plan,
  att,
  defaultEventId,
  onClose,
  onSave,
}: {
  demo: MailDemo;
  plan: StandplanData;
  att: Attachment;
  defaultEventId: string | null;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const t = useTranslations("postfach.actions");
  const locale = useLocale();
  const [eventId, setEventId] = useState(defaultEventId ?? plan.events[0]?.id ?? "");
  const ev = plan.events.find((e) => e.id === eventId);
  const permits = demo.permits.filter((p) => p.venueId === ev?.venueId);
  const [permitId, setPermitId] = useState("");
  const [received, setReceived] = useState(todayIn());
  const [validUntil, setValidUntil] = useState(ev?.startsOn ?? "");
  const chosen = permits.find((p) => p.id === permitId) ?? permits[0];
  return (
    <SimDialog
      title={t("permit.title", { file: att.name })}
      onClose={onClose}
      onSave={() =>
        chosen && onSave(t("permit.label", { title: chosen.title, event: ev?.name ?? "" }))
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("permit.event")}>
          <NativeSelect value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {plan.events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatDateWithWeekday(e.startsOn, locale)} · {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("permit.permit")}>
          <NativeSelect
            value={chosen?.id ?? ""}
            onChange={(e) => setPermitId(e.target.value)}
            disabled={!permits.length}
          >
            {permits.length === 0 && <option value="">{t("permit.none")}</option>}
            {permits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.season ? ` (${p.season})` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("permit.received")}>
          <Input type="date" value={received} onChange={(e) => setReceived(e.target.value)} />
        </Field>
        <Field label={t("permit.validUntil")}>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      <p className="text-muted-foreground text-tiny">{t("permit.effect")}</p>
    </SimDialog>
  );
}

const DOC_TYPES = ["lageplan", "vertrag", "bescheid", "sonstiges"] as const;

function VenueDialog({
  demo,
  plan,
  att,
  defaultEventId,
  onClose,
  onSave,
}: {
  demo: MailDemo;
  plan: StandplanData;
  att: Attachment;
  defaultEventId: string | null;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const t = useTranslations("postfach.actions");
  const defaultVenue =
    plan.events.find((e) => e.id === defaultEventId)?.venueId ?? demo.venues[0]?.id ?? "";
  const [venueId, setVenueId] = useState(defaultVenue);
  const [type, setType] = useState<(typeof DOC_TYPES)[number]>(
    /vertrag/i.test(att.name) ? "vertrag" : "sonstiges",
  );
  const venue = demo.venues.find((v) => v.id === venueId);
  return (
    <SimDialog
      title={t("venue.title", { file: att.name })}
      onClose={onClose}
      onSave={() =>
        onSave(t("venue.label", { type: t(`docType.${type}`), venue: venue?.name ?? "" }))
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("venue.venue")}>
          <NativeSelect value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {demo.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("venue.type")}>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`docType.${d}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </SimDialog>
  );
}
