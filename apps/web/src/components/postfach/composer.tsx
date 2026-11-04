"use client";

import {
  assembleOutgoing,
  buildQuote,
  eventBlock,
  fillVariables,
  htmlToText,
  variablesIn,
} from "@marktwerk/core";
import type { Editor } from "@tiptap/react";
import { FileText, Paperclip, Send, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { useStandplanStore } from "@/components/standplan/store";
import type { StandplanData } from "@/components/standplan/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDateWithWeekday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { variableValues } from "./context";
import {
  addNote,
  deleteDraft,
  saveDraft,
  sendMessage,
  signatureOf,
  templatesOf,
  updateMailState,
  useMailStore,
} from "./mail-store";
import { RichEditor } from "./rich-editor";
import type {
  Address,
  Attachment,
  Conversation,
  Draft,
  DraftMode,
  MailboxId,
  MailDemo,
  Message,
} from "./types";

const MAX_ATTACHMENT = 1.5 * 1024 * 1024;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
/** Pending sends: the 5-second undo window survives closing the composer. */
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function parseAddresses(raw: string, known: Address[]): { list: Address[]; invalid: string[] } {
  const list: Address[] = [];
  const invalid: string[] = [];
  for (const part of raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^(.*)<([^>]+)>$/.exec(part);
    const address = (m ? m[2] : part)?.trim() ?? "";
    const name =
      (m ? m[1]?.trim().replace(/^"|"$/g, "") : "") ||
      known.find((k) => k.address === address)?.name ||
      "";
    if (EMAIL.test(address)) list.push({ name, address });
    else invalid.push(part);
  }
  return { list, invalid };
}

const formatAddresses = (list: Address[]) =>
  list.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");

function subjectFor(mode: DraftMode, subject: string): string {
  if (mode === "reply" || mode === "replyAll")
    return `AW: ${subject.replace(/^\s*((aw|wg|re|fwd?)\s*:\s*)+/i, "")}`;
  if (mode === "forward") return `WG: ${subject.replace(/^\s*((aw|wg|re|fwd?)\s*:\s*)+/i, "")}`;
  return subject;
}

export function Composer({
  demo,
  plan,
  conversation,
  messages,
  mode,
  resume,
  defaultTo,
  defaultEventId,
  onClose,
  onSent,
}: {
  demo: MailDemo;
  plan: StandplanData;
  conversation: Conversation | null;
  messages: Message[];
  mode: DraftMode;
  resume?: Draft;
  defaultTo?: Address[];
  defaultEventId?: string | null;
  onClose: () => void;
  onSent?: (conversationId: string) => void;
}) {
  const t = useTranslations("postfach.composer");
  const locale = useLocale();
  const { showToast } = useShell();
  const { state, update } = useMailStore();
  const { state: standplan } = useStandplanStore();
  const lastMessage = [...messages].reverse().find((m) => m.kind !== "note");
  const lastIncoming = [...messages].reverse().find((m) => m.kind === "incoming");

  // Initial draft: resume, or build one for this mode.
  // biome-ignore lint/correctness/useExhaustiveDependencies: built once per composer
  const initial = useMemo<Draft>(() => {
    if (resume) return resume;
    const existing = state.drafts.find(
      (d) => d.conversationId === (conversation?.id ?? null) && d.mode === mode && conversation,
    );
    if (existing) return existing;
    const to =
      mode === "reply" || mode === "replyAll"
        ? [conversation?.external ?? { name: "", address: "" }].filter((a) => a.address)
        : (defaultTo ?? []);
    const cc =
      mode === "replyAll"
        ? [...(lastIncoming?.cc ?? []), ...(lastIncoming?.to ?? [])].filter(
            (a) => !demo.mailboxes.some((b) => b.address === a.address),
          )
        : [];
    return {
      id: `draft-${Date.now()}`,
      conversationId: conversation?.id ?? null,
      mailboxId: conversation?.mailboxId ?? "info",
      mode,
      to,
      cc,
      subject: conversation ? subjectFor(mode, conversation.subject) : "",
      html: "<p></p>",
      attachments: mode === "forward" ? (lastMessage?.attachments ?? []) : [],
      includeSignature: mode !== "note",
      includeEventBlock: Boolean(conversation?.eventId ?? defaultEventId),
      quoteOf: mode === "new" || mode === "note" ? null : (lastMessage?.id ?? null),
      eventId: conversation?.eventId ?? defaultEventId ?? null,
      updatedAt: new Date().toISOString(),
    };
  }, []);

  const [draft, setDraft] = useState<Draft>(initial);
  const [toRaw, setToRaw] = useState(formatAddresses(initial.to));
  const [ccRaw, setCcRaw] = useState(formatAddresses(initial.cc));
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [showQuote, setShowQuote] = useState(false);
  const [errors, setErrors] = useState<{ to?: string; cc?: string }>({});
  const [savedAt, setSavedAt] = useState<string | null>(resume ? resume.updatedAt : null);
  const editorRef = useRef<Editor | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isNote = mode === "note";

  const eventId = draft.eventId;
  const ev = plan.events.find((e) => e.id === eventId);
  const knownAddresses = [
    conversation?.external,
    ...messages.flatMap((m) => [m.from, ...m.to, ...m.cc]),
  ].filter((a): a is Address => !!a?.address);
  const values = variableValues({
    demo,
    plan,
    standplan,
    manualItems: standplan.manualItems,
    conversation,
    eventId,
    mailboxId: draft.mailboxId,
    to: draft.to,
    me: demo.me,
  });
  const signature = signatureOf(demo, state, draft.mailboxId);
  const usedKeys = [
    ...variablesIn(draft.html),
    ...(draft.includeSignature && !isNote ? variablesIn(signature) : []),
  ];
  const missing = [...new Set(usedKeys.filter((k) => !values[k]))];
  const quoteMsg = messages.find((m) => m.id === draft.quoteOf);

  // Autosave (not for notes).
  const firstRender = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: save whenever the draft changes
  useEffect(() => {
    if (isNote) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h = setTimeout(() => {
      const d = { ...draft, updatedAt: new Date().toISOString() };
      update((s) => saveDraft(s, d));
      setSavedAt(d.updatedAt);
    }, 800);
    return () => clearTimeout(h);
  }, [draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const templates = templatesOf(demo, state)
    .filter((tp) => !tp.mailboxId || tp.mailboxId === draft.mailboxId)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const insertTemplate = (id: string) => {
    const tp = templates.find((x) => x.id === id);
    const editor = editorRef.current;
    if (!tp || !editor) return;
    if (editor.isEmpty) editor.commands.setContent(tp.html, { emitUpdate: true });
    else editor.chain().focus().insertContent(tp.html).run();
    // A template subject only fills an empty subject; replies keep their "AW: …".
    if (tp.subject && !draft.subject.trim()) patch({ subject: tp.subject });
  };

  const addFiles = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size > MAX_ATTACHMENT) {
        showToast({ tone: "error", message: t("tooLarge", { name: file.name }) });
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const att: Attachment = {
          id: `att-${Date.now()}-${file.name}`,
          name: file.name,
          size: file.size,
          mime: file.type || "application/octet-stream",
          dataUrl: String(reader.result),
        };
        setDraft((d) => ({ ...d, attachments: [...d.attachments, att] }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validate = () => {
    const to = parseAddresses(toRaw, knownAddresses);
    const cc = parseAddresses(ccRaw, knownAddresses);
    const next: { to?: string; cc?: string } = {};
    if (to.invalid.length) next.to = t("invalidAddress", { value: to.invalid.join(", ") });
    else if (to.list.length === 0) next.to = t("noRecipient");
    if (cc.invalid.length) next.cc = t("invalidAddress", { value: cc.invalid.join(", ") });
    setErrors(next);
    return { ok: !next.to && !next.cc, to: to.list, cc: cc.list };
  };

  const saveNote = () => {
    const editor = editorRef.current;
    if (!editor || editor.isEmpty || !conversation) return;
    const html = editor.getHTML();
    update((s) => addNote(s, conversation.id, html, htmlToText(html), demo.me));
    onClose();
  };

  const send = (close: boolean) => {
    if (isNote) return saveNote();
    const v = validate();
    if (!v.ok || missing.length > 0) return;
    const body = fillVariables(draft.html, values).html;
    const sig = draft.includeSignature ? fillVariables(signature, values).html : null;
    const block =
      draft.includeEventBlock && ev
        ? eventBlock({
            name: ev.name,
            startsOn: ev.startsOn,
            venueName: ev.venueName,
            setup: ev.times.setup,
            open: ev.times.open,
            close: ev.times.close,
            pricePerMCents: ev.pricePerMCents,
          })
        : null;
    const quote = quoteMsg
      ? buildQuote({
          fromName: quoteMsg.from.name || quoteMsg.from.address,
          at: quoteMsg.at,
          html: quoteMsg.html,
        })
      : null;
    const out = assembleOutgoing({
      bodyHtml: body,
      eventBlockHtml: block,
      signatureHtml: sig,
      quoteHtml: quote,
    });
    const mailbox = demo.mailboxes.find((b) => b.id === draft.mailboxId);
    const finalDraft = { ...draft, to: v.to, cc: v.cc, updatedAt: new Date().toISOString() };
    update((s) => saveDraft(s, finalDraft));
    const key = finalDraft.id;
    const timer = setTimeout(() => {
      pending.delete(key);
      let newId = conversation?.id ?? "";
      updateMailState((s) => {
        const r = sendMessage(
          demo,
          s,
          {
            draftId: key,
            conversationId: conversation?.id ?? null,
            mailboxId: finalDraft.mailboxId,
            from: {
              name: `Coelln Konzept – ${mailbox?.label ?? ""}`,
              address: mailbox?.address ?? "",
            },
            to: v.to,
            cc: v.cc,
            subject: finalDraft.subject,
            html: out.html,
            text: out.text,
            attachments: finalDraft.attachments,
            eventId: finalDraft.eventId,
            close,
          },
          demo.me,
        );
        newId = r.conversationId;
        return r.state;
      });
      onSent?.(newId);
    }, 5000);
    pending.set(key, timer);
    showToast({
      message: close ? t("sendingClose") : t("sending"),
      actionLabel: t("undoSend"),
      onAction: () => {
        const h = pending.get(key);
        if (h) clearTimeout(h);
        pending.delete(key);
        showToast({ message: t("sendCancelled") });
      },
    });
    onClose();
  };

  const discard = () => {
    const before = state.drafts.find((d) => d.id === draft.id);
    update((s) => deleteDraft(s, draft.id));
    onClose();
    if (before) {
      showToast({
        message: t("discarded"),
        actionLabel: t("undo"),
        onAction: () => void update((s) => saveDraft(s, before)),
      });
    }
  };

  return (
    <section
      aria-label={isNote ? t("noteLabel") : t("label")}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        isNote ? "border-status-warn-dot bg-status-warn-bg/40" : "bg-card shadow-sm",
      )}
    >
      {!isNote && (
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1.5 text-small">
          <label htmlFor={`${draft.id}-from`} className="text-muted-foreground">
            {t("from")}
          </label>
          <NativeSelect
            id={`${draft.id}-from`}
            value={draft.mailboxId}
            onChange={(e) => patch({ mailboxId: e.target.value as MailboxId })}
            className="h-8"
          >
            {demo.mailboxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.address}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor={`${draft.id}-to`} className="text-muted-foreground">
            {t("to")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={`${draft.id}-to`}
              value={toRaw}
              aria-invalid={Boolean(errors.to)}
              aria-describedby={errors.to ? `${draft.id}-to-err` : undefined}
              onChange={(e) => setToRaw(e.target.value)}
              onBlur={() => {
                const r = parseAddresses(toRaw, knownAddresses);
                if (!r.invalid.length) patch({ to: r.list });
              }}
              placeholder={t("toPlaceholder")}
              className="flex-1"
            />
            {!showCc && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowCc(true)}>
                {t("cc")}
              </Button>
            )}
          </div>
          {errors.to && (
            <p id={`${draft.id}-to-err`} className="col-start-2 text-status-critical text-tiny">
              {errors.to}
            </p>
          )}
          {showCc && (
            <>
              <label htmlFor={`${draft.id}-cc`} className="text-muted-foreground">
                {t("cc")}
              </label>
              <Input
                id={`${draft.id}-cc`}
                value={ccRaw}
                aria-invalid={Boolean(errors.cc)}
                onChange={(e) => setCcRaw(e.target.value)}
                onBlur={() => {
                  const r = parseAddresses(ccRaw, knownAddresses);
                  if (!r.invalid.length) patch({ cc: r.list });
                }}
              />
              {errors.cc && (
                <p className="col-start-2 text-status-critical text-tiny">{errors.cc}</p>
              )}
            </>
          )}
          <label htmlFor={`${draft.id}-subject`} className="text-muted-foreground">
            {t("subject")}
          </label>
          <Input
            id={`${draft.id}-subject`}
            value={draft.subject}
            onChange={(e) => patch({ subject: e.target.value })}
          />
          <label htmlFor={`${draft.id}-event`} className="text-muted-foreground">
            {t("event")}
          </label>
          <NativeSelect
            id={`${draft.id}-event`}
            value={draft.eventId ?? ""}
            onChange={(e) =>
              patch({ eventId: e.target.value || null, includeEventBlock: Boolean(e.target.value) })
            }
            className="h-8"
          >
            <option value="">{t("noEvent")}</option>
            {plan.events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatDateWithWeekday(e.startsOn, locale)} · {e.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <RichEditor
        initialHtml={initial.html}
        label={isNote ? t("noteLabel") : t("body")}
        missing={missing}
        onChange={(html) => setDraft((d) => ({ ...d, html }))}
        onReady={(e) => {
          editorRef.current = e;
          e.commands.focus("end");
        }}
        onModEnter={() => send(false)}
        minHeight={isNote ? "5rem" : "9rem"}
        extraTools={
          isNote ? null : (
            <>
              <label className="flex items-center gap-1 text-small">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                <select
                  aria-label={t("template")}
                  value=""
                  onChange={(e) => insertTemplate(e.target.value)}
                  className="h-7 max-w-44 rounded-md bg-transparent px-1 text-small hover:bg-hover"
                >
                  <option value="">{t("template")}</option>
                  {(["buchung", "genehmigung", "allgemein"] as const).map((cat) => {
                    const list = templates.filter((x) => x.category === cat);
                    return list.length ? (
                      <optgroup key={cat} label={t(`categories.${cat}`)}>
                        {list.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("attach")}
                title={t("attach")}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip />
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
            </>
          )
        }
      />

      {draft.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {draft.attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-md border bg-sunken px-2 py-0.5 text-tiny"
            >
              <Paperclip className="size-3" />
              {a.name}
              <button
                type="button"
                aria-label={t("removeAttachment", { name: a.name })}
                onClick={() =>
                  patch({ attachments: draft.attachments.filter((x) => x.id !== a.id) })
                }
                className="rounded p-0.5 hover:bg-hover"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isNote && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={draft.includeSignature}
              onChange={(e) => patch({ includeSignature: e.target.checked })}
            />
            {t("signature")}
          </label>
          <label className={cn("flex items-center gap-1.5", !ev && "text-faint-foreground")}>
            <input
              type="checkbox"
              disabled={!ev}
              checked={draft.includeEventBlock && Boolean(ev)}
              onChange={(e) => patch({ includeEventBlock: e.target.checked })}
            />
            {t("eventBlock")}
          </label>
          {quoteMsg && (
            <button
              type="button"
              className="text-accent-soft-foreground underline-offset-4 hover:underline"
              aria-expanded={showQuote}
              onClick={() => setShowQuote((q) => !q)}
            >
              {showQuote ? t("hideQuote") : t("showQuote")}
            </button>
          )}
        </div>
      )}
      {showQuote && quoteMsg && (
        <blockquote className="max-h-40 overflow-y-auto border-l-2 pl-3 text-muted-foreground text-small">
          {quoteMsg.text}
        </blockquote>
      )}

      {missing.length > 0 && (
        <p
          role="status"
          className="rounded-md bg-status-critical-bg px-2 py-1 text-status-critical text-tiny"
        >
          {t("missing", { keys: missing.join(", ") })}
          {!ev &&
          missing.some((k) =>
            [
              "Veranstaltung",
              "Datum",
              "Ort",
              "Aufbau",
              "Marktzeit",
              "PreisProMeter",
              "Stand",
              "Standlänge",
            ].includes(k),
          )
            ? ` ${t("missingEventHint")}`
            : ""}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isNote ? (
          <Button variant="default" onClick={saveNote}>
            {t("saveNote")}
          </Button>
        ) : (
          <>
            <Button variant="default" onClick={() => send(false)} disabled={missing.length > 0}>
              <Send />
              {t("send")}
            </Button>
            {conversation && (
              <Button onClick={() => send(true)} disabled={missing.length > 0}>
                {t("sendAndClose")}
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" onClick={onClose}>
          {isNote ? t("cancel") : t("close")}
        </Button>
        {!isNote && (
          <Button variant="ghost" onClick={discard}>
            {t("discard")}
          </Button>
        )}
        {!isNote && savedAt && (
          <span className="ml-auto text-faint-foreground text-tiny">
            {t("draftSaved", {
              time: new Date(savedAt).toLocaleTimeString(locale === "de" ? "de-DE" : "en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
        )}
      </div>
    </section>
  );
}
