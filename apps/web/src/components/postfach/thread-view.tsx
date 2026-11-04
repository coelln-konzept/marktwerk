"use client";

import { type ConversationStatus, type SpamReason, sortedTree, stallNumber } from "@marktwerk/core";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Forward,
  MailOpen,
  MapPinned,
  PanelRight,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import type { StandplanState } from "@/components/standplan/store";
import type { StandplanData } from "@/components/standplan/types";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateWithWeekday, formatLength } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { patchConversation, simulateIncoming, useMailStore } from "./mail-store";
import { sanitizeMailHtml } from "./sanitize";
import type {
  ActionEntry,
  Conversation,
  Draft,
  DraftMode,
  MailDemo,
  MailFolder,
  Message,
} from "./types";

const fmt = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ThreadView({
  demo,
  plan,
  standplan,
  conversation,
  messages,
  actions,
  composer,
  folders,
  filedIn,
  spam,
  onMove,
  onSpam,
  onCompose,
  onCloseComposer,
  onShowActions,
}: {
  demo: MailDemo;
  plan: StandplanData;
  standplan: StandplanState;
  conversation: Conversation;
  messages: Message[];
  actions: ActionEntry[];
  composer: { mode: DraftMode; resume?: Draft } | null;
  folders: MailFolder[];
  filedIn: string | null;
  spam: { spam: boolean; reasons: SpamReason[]; manual: boolean };
  /** "posteingang", "spam" or a folder id. */
  onMove: (target: string) => void;
  onSpam: (spam: boolean) => void;
  onCompose: (mode: DraftMode) => void;
  onCloseComposer: () => void;
  onShowActions?: () => void;
}) {
  const t = useTranslations("postfach");
  const locale = useLocale();
  const { showToast } = useShell();
  const { update } = useMailStore();
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, messages.length - 2);
  const visible = messages.slice(hidden);
  const person = (id: string | null | undefined) => demo.people.find((p) => p.id === id)?.name;

  const change = (patch: Partial<Conversation>, message: string) => {
    const before = {
      status: conversation.status,
      assigneeId: conversation.assigneeId,
      eventId: conversation.eventId,
    };
    update((s) => patchConversation(s, conversation.id, patch));
    showToast({
      message,
      actionLabel: t("undo"),
      onAction: () => void update((s) => patchConversation(s, conversation.id, before)),
    });
  };

  // Action log lines are interleaved with the messages by time.
  const timeline = [
    ...visible.map((m) => ({ at: m.at, m, a: undefined as ActionEntry | undefined })),
    ...actions
      .filter((a) => hidden === 0 || a.at >= (visible[0]?.at ?? ""))
      .map((a) => ({ at: a.at, m: undefined as Message | undefined, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <article className="flex min-w-0 flex-col gap-3" aria-labelledby="thread-subject">
      <header className="flex flex-col gap-2 border-b pb-3">
        <div className="flex items-start gap-2">
          <h2 id="thread-subject" className="min-w-0 flex-1 font-semibold text-base leading-snug">
            {conversation.subject}
          </h2>
          {onShowActions && (
            <Button size="sm" className="2xl:hidden" onClick={onShowActions}>
              <PanelRight />
              {t("actions.open")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-small">
          <NativeSelect
            aria-label={t("thread.status")}
            value={conversation.status}
            onChange={(e) => {
              const s = e.target.value as ConversationStatus;
              change({ status: s }, t("toast.status", { status: t(`status.${s}`) }));
            }}
            className="h-8"
          >
            {(["offen", "wartet", "erledigt"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("thread.assignee")}
            value={conversation.assigneeId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              change(
                { assigneeId: id },
                id ? t("toast.assigned", { name: person(id) ?? "" }) : t("toast.unassigned"),
              );
            }}
            className="h-8"
          >
            <option value="">{t("thread.nobody")}</option>
            {demo.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === demo.me.id ? t("thread.me", { name: p.name }) : p.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("thread.event")}
            value={conversation.eventId ?? ""}
            onChange={(e) => {
              const id = e.target.value || null;
              const ev = plan.events.find((x) => x.id === id);
              change(
                { eventId: id },
                ev ? t("toast.linked", { name: ev.name }) : t("toast.unlinked"),
              );
            }}
            className="h-8 max-w-72"
          >
            <option value="">{t("thread.noEvent")}</option>
            {plan.events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatDateWithWeekday(e.startsOn, locale)} · {e.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("thread.moveTo")}
            value={spam.spam ? "spam" : (filedIn ?? "posteingang")}
            onChange={(e) => onMove(e.target.value)}
            className="h-8 max-w-56"
          >
            <option value="posteingang">{t("folders.posteingang")}</option>
            {sortedTree(folders).map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {`${"\u00a0\u00a0".repeat(depth)}${folder.name}`}
              </option>
            ))}
            <option value="spam">{t("folders.spam")}</option>
          </NativeSelect>
          <Button size="sm" variant="ghost" onClick={() => onSpam(!spam.spam)}>
            {spam.spam ? <ShieldCheck /> : <ShieldAlert />}
            {spam.spam ? t("thread.notSpam") : t("thread.markSpam")}
          </Button>
          <span className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update((s) => patchConversation(s, conversation.id, { unread: true }))}
            >
              <MailOpen />
              {t("thread.markUnread")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={t("thread.simulateHint")}
              onClick={() => update((s) => simulateIncoming(demo, s, conversation.id))}
            >
              <Zap />
              {t("thread.simulate")}
            </Button>
          </span>
        </div>
        {spam.spam && (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-md bg-status-critical-bg px-2 py-1.5 text-status-critical text-tiny"
          >
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {spam.manual
                ? t("thread.spamManual")
                : t("thread.spamRules", {
                    reasons: spam.reasons.map((r) => t(`spamReason.${r}`)).join(", "),
                  })}
            </span>
          </p>
        )}
        <p className="text-muted-foreground text-tiny">
          {t("thread.with", {
            name: conversation.external.name || conversation.external.address,
            address: conversation.external.address,
          })}
        </p>
      </header>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 self-start rounded-md px-2 py-1 text-accent-soft-foreground text-small hover:bg-hover"
        >
          <ChevronDown className="size-4" />
          {t("thread.older", { count: hidden })}
        </button>
      )}

      <ol className="flex flex-col gap-3">
        {timeline.map((row) =>
          row.m ? (
            <li key={row.m.id}>
              <MessageCard
                m={row.m}
                demo={demo}
                plan={plan}
                standplan={standplan}
                conversationId={conversation.id}
                locale={locale}
              />
            </li>
          ) : row.a ? (
            <li
              key={row.a.id}
              className="flex items-center gap-2 px-2 text-faint-foreground text-tiny"
            >
              <span className="h-px flex-1 bg-border" aria-hidden />
              {t("thread.actionLine", {
                summary: row.a.summary,
                name: person(row.a.authorId) ?? "",
                time: fmt(row.a.at, locale),
              })}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </li>
          ) : null,
        )}
      </ol>

      {composer ? (
        <Composer
          key={`${conversation.id}-${composer.mode}-${composer.resume?.id ?? ""}`}
          demo={demo}
          plan={plan}
          conversation={conversation}
          messages={messages}
          mode={composer.mode}
          resume={composer.resume}
          onClose={onCloseComposer}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="default" onClick={() => onCompose("reply")}>
            <Reply />
            {t("thread.reply")}
          </Button>
          <Button onClick={() => onCompose("replyAll")}>
            <ReplyAll />
            {t("thread.replyAll")}
          </Button>
          <Button onClick={() => onCompose("forward")}>
            <Forward />
            {t("thread.forward")}
          </Button>
          <Button onClick={() => onCompose("note")}>
            <StickyNote />
            {t("thread.note")}
          </Button>
        </div>
      )}
    </article>
  );
}

function MessageCard({
  m,
  demo,
  plan,
  standplan,
  conversationId,
  locale,
}: {
  m: Message;
  demo: MailDemo;
  plan: StandplanData;
  standplan: StandplanState;
  conversationId: string;
  locale: string;
}) {
  const t = useTranslations("postfach");
  const { state } = useMailStore();
  const author = demo.people.find((p) => p.id === m.authorId)?.name;
  if (m.kind === "note") {
    return (
      <div className="rounded-lg border border-status-warn-dot/60 bg-status-warn-bg p-3 text-small">
        <p className="mb-1 flex items-center gap-1.5 font-semibold text-status-warn text-tiny">
          <StickyNote className="size-3.5" />
          {t("thread.noteBy", { name: author ?? m.from.name, time: fmt(m.at, locale) })}
        </p>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by a whitelist */}
        <div className="mail-html" dangerouslySetInnerHTML={{ __html: sanitizeMailHtml(m.html) }} />
      </div>
    );
  }
  const out = m.kind === "outgoing";
  return (
    <div className={cn("rounded-lg border p-3 text-small", out ? "bg-accent-soft/50" : "bg-card")}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">
          {out ? (author ?? m.from.name) : m.from.name || m.from.address}
        </span>
        <span className="text-muted-foreground text-tiny">
          {out
            ? t("thread.outgoingTo", {
                to: m.to.map((a) => a.name || a.address).join(", "),
                box: m.from.address,
              })
            : `<${m.from.address}>`}
        </span>
        <span className="ml-auto text-faint-foreground text-tiny">{fmt(m.at, locale)}</span>
      </div>
      {m.cc.length > 0 && (
        <p className="mb-1 text-muted-foreground text-tiny">
          {t("thread.cc", { list: m.cc.map((a) => a.address).join(", ") })}
        </p>
      )}
      {m.parse?.kind === "request" ? (
        <FormRequest
          m={m}
          plan={plan}
          standplan={standplan}
          conversationId={conversationId}
          locale={locale}
        />
      ) : (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by a whitelist
        <div className="mail-html" dangerouslySetInnerHTML={{ __html: sanitizeMailHtml(m.html) }} />
      )}
      {m.attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {m.attachments.map((a) => (
            <li key={a.id}>
              <a
                href={a.dataUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={a.dataUrl ? undefined : a.name}
                className="flex items-center gap-1 rounded-md border bg-sunken px-2 py-0.5 text-tiny hover:bg-hover"
              >
                <Paperclip className="size-3" />
                {a.name}
                <span className="text-faint-foreground">
                  {Math.max(1, Math.round(a.size / 1024))} KB
                </span>
              </a>
              {state.filed[a.id] && (
                <span className="mt-0.5 block text-status-ok text-tiny">{state.filed[a.id]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Website-form request: original next to the recognised fields (research 08 §A), status per date. */
function FormRequest({
  m,
  plan,
  standplan,
  conversationId,
  locale,
}: {
  m: Message;
  plan: StandplanData;
  standplan: StandplanState;
  conversationId: string;
  locale: string;
}) {
  const t = useTranslations("postfach.form");
  const p = m.parse;
  if (p?.kind !== "request") return null;
  const req = p.ok ? p.request : p.partial;
  const issues = p.ok ? p.warnings : [...p.errors, ...p.warnings];
  const issueFor = (field: string) => issues.find((i) => i.field === field);
  const mailId = conversationId.slice(2);
  const items = plan.items.filter((i) => i.mailId === mailId);
  const fields: [string, string, React.ReactNode][] = [
    ["requestRef", t("requestRef"), req.requestRef],
    ["eventName", t("eventName"), req.eventName],
    ["dates", t("dates"), req.dates?.map((d) => formatDateWithWeekday(d, locale)).join(", ")],
    ["name", t("name"), [req.name, req.companyName].filter(Boolean).join(" · ")],
    ["email", t("email"), req.email],
    ["lengthCm", t("length"), req.lengthCm ? formatLength(req.lengthCm, locale) : null],
    [
      "carRequested",
      t("car"),
      req.carRequested
        ? t("yesLength", { length: formatLength(req.carLengthCm ?? 500, locale) })
        : t("no"),
    ],
    ["preferredSpot", t("spot"), req.preferredSpot?.raw ?? "–"],
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-sunken p-2 font-mono text-[12px] leading-relaxed">
        {m.text}
      </pre>
      <div className="flex flex-col gap-2">
        {!p.ok && (
          <p
            role="alert"
            className="flex gap-1.5 rounded-md bg-status-critical-bg p-2 text-status-critical text-tiny"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            {t("failed")}
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1">
          {fields.map(([key, label, value]) => {
            const issue = issueFor(key);
            return (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={cn(issue && !p.ok && "text-status-critical")}>
                  {value || (issue ? `„${issue.value ?? ""}“` : "–")}
                </dd>
                <dd>
                  {issue ? (
                    <TriangleAlert
                      className={cn("size-4", p.ok ? "text-status-warn" : "text-status-critical")}
                      aria-label={t("issue")}
                    />
                  ) : (
                    <CircleCheck className="size-4 text-status-ok" aria-label={t("ok")} />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        {req.note && (
          <p className="rounded-md bg-status-warn-bg p-2 text-status-warn text-tiny">
            <strong>{t("note")}: </strong>
            {req.note}
          </p>
        )}
        {items.length > 0 && (
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const ev = plan.events.find((e) => e.id === item.eventId);
              const list =
                standplan.placements[item.eventId] ??
                (plan.existing[item.eventId] ?? []).map((x) => ({
                  ...x,
                  status: "assigned" as const,
                }));
              const pl = list.find((x) => x.itemId === item.id);
              const row = plan.venues
                .find((v) => v.id === ev?.venueId)
                ?.zones.flatMap((z) => z.rows)
                .find((r) => r.id === pl?.rowId);
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 text-tiny">
                  <span className="font-medium">
                    {ev ? formatDateWithWeekday(ev.startsOn, locale) : ""}
                  </span>
                  {pl && row ? (
                    pl.status === "assigned" ? (
                      <StatusBadge tone="ok" icon={CircleCheck}>
                        {t("confirmed", { stall: stallNumber(row.label, pl.startCm) })}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warn" icon={CircleDashed}>
                        {t("proposed", { stall: stallNumber(row.label, pl.startCm) })}
                      </StatusBadge>
                    )
                  ) : (
                    <StatusBadge tone="info" icon={MapPinned}>
                      {t("open")}
                    </StatusBadge>
                  )}
                  <Link
                    href={`/standplan?veranstaltung=${item.eventId}` as Route}
                    className="ml-auto text-accent-soft-foreground underline-offset-4 hover:underline"
                  >
                    {t("openPlan")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
