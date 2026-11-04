"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Inbox,
  type LucideIcon,
  PenLine,
  Search,
  Send,
  SquarePen,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStandplanStore } from "@/components/standplan/store";
import type { StandplanData } from "@/components/standplan/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { ActionsPanel } from "./actions-panel";
import { ConversationList, type ListRow } from "./conversation-list";
import { allConversations, messagesOf, patchConversation, useMailStore } from "./mail-store";
import { ThreadView } from "./thread-view";
import type { Conversation, Draft, DraftMode, MailboxId, MailDemo } from "./types";

export type Folder = "offen" | "wartet" | "erledigt" | "gesendet" | "entwuerfe" | "nichterkannt";
const FOLDERS: { key: Folder; icon: LucideIcon }[] = [
  { key: "offen", icon: CircleDot },
  { key: "wartet", icon: Clock },
  { key: "erledigt", icon: CircleCheck },
  { key: "gesendet", icon: Send },
  { key: "entwuerfe", icon: PenLine },
  { key: "nichterkannt", icon: CircleAlert },
];

/**
 * PROTOTYPE light mail browser for the shared mailboxes (spec 2026-11-04). Classic screen: every state
 * (mailbox, folder, conversation, search) is in the URL.
 */
export function PostfachView({
  demo,
  plan,
  initial,
}: {
  demo: MailDemo;
  plan: StandplanData;
  initial: {
    postfach: string | null;
    ordner: string | null;
    konv: string | null;
    q: string | null;
    mir: boolean;
  };
}) {
  const t = useTranslations("postfach");
  const router = useRouter();
  const { state, update, reset } = useMailStore();
  const { state: standplan } = useStandplanStore();
  const [mailbox, setMailbox] = useState<MailboxId | "alle">(
    demo.mailboxes.some((b) => b.id === initial.postfach)
      ? (initial.postfach as MailboxId)
      : "alle",
  );
  const [folder, setFolder] = useState<Folder>(
    FOLDERS.some((f) => f.key === initial.ordner) ? (initial.ordner as Folder) : "offen",
  );
  const [selected, setSelected] = useState<string | null>(initial.konv);
  const [q, setQ] = useState(initial.q ?? "");
  const [mine, setMine] = useState(initial.mir);
  const [composer, setComposer] = useState<{ mode: DraftMode; resume?: Draft } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const syncUrl = (p: {
    mailbox?: typeof mailbox;
    folder?: Folder;
    konv?: string | null;
    q?: string;
    mine?: boolean;
  }) => {
    const params = new URLSearchParams();
    const mb = p.mailbox ?? mailbox;
    const f = p.folder ?? folder;
    const k = p.konv === undefined ? selected : p.konv;
    const query = p.q ?? q;
    const m = p.mine ?? mine;
    if (mb !== "alle") params.set("postfach", mb);
    if (f !== "offen") params.set("ordner", f);
    if (k) params.set("konv", k);
    if (query) params.set("q", query);
    if (m) params.set("mir", "1");
    router.replace(`/postfach${params.size ? `?${params}` : ""}` as Route, { scroll: false });
  };

  const conversations = useMemo(() => allConversations(demo, state), [demo, state]);
  const inBox = (c: Conversation) => mailbox === "alle" || c.mailboxId === mailbox;
  const msgs = (id: string) => messagesOf(demo, state, id);
  const hasOutgoing = (id: string) => msgs(id).some((m) => m.kind === "outgoing");
  const isUnparsed = (id: string) =>
    msgs(id).some((m) => m.parse?.kind === "request" && !m.parse.ok);
  const matches = (c: Conversation) => {
    if (mine && c.assigneeId !== demo.me.id) return false;
    if (!q.trim()) return true;
    const hay = `${c.subject} ${c.external.name} ${c.external.address} ${msgs(c.id)
      .map((m) => m.text)
      .join(" ")}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .every((w) => hay.includes(w));
  };
  const inFolder = (c: Conversation, f: Folder) =>
    f === "gesendet"
      ? hasOutgoing(c.id)
      : f === "nichterkannt"
        ? isUnparsed(c.id)
        : f === "entwuerfe"
          ? false
          : c.status === f;

  const drafts = state.drafts.filter((d) => mailbox === "alle" || d.mailboxId === mailbox);
  const counts = Object.fromEntries(
    FOLDERS.map(({ key }) => [
      key,
      key === "entwuerfe"
        ? drafts.length
        : conversations.filter((c) => inBox(c) && inFolder(c, key)).length,
    ]),
  ) as Record<Folder, number>;
  const boxOpen = (id: MailboxId | "alle") =>
    conversations.filter((c) => (id === "alle" || c.mailboxId === id) && c.status === "offen")
      .length;

  const rows: ListRow[] =
    folder === "entwuerfe"
      ? drafts.map((d) => ({
          kind: "draft",
          d,
          c: conversations.find((c) => c.id === d.conversationId),
        }))
      : conversations
          .filter((c) => inBox(c) && inFolder(c, folder) && matches(c))
          .map((c) => {
            const ms = msgs(c.id);
            return {
              kind: "conversation",
              c,
              last: ms.at(-1),
              count: ms.filter((m) => m.kind !== "note").length,
              attach: ms.some((m) => m.attachments.length > 0),
            };
          });

  const current = conversations.find((c) => c.id === selected) ?? null;
  const currentMessages = current ? msgs(current.id) : [];
  const currentActions = current
    ? state.actions.filter((a) => a.conversationId === current.id)
    : [];

  const open = (id: string | null) => {
    setSelected(id);
    setComposer(null);
    syncUrl({ konv: id });
    if (id) {
      const c = conversations.find((x) => x.id === id);
      if (c?.unread) update((s) => patchConversation(s, id, { unread: false }));
    }
  };

  const openDraft = (d: Draft) => {
    if (d.conversationId) {
      setSelected(d.conversationId);
      syncUrl({ konv: d.conversationId });
      setComposer({ mode: d.mode, resume: d });
    } else {
      router.push(`/postfach/neu?entwurf=${d.id}` as Route);
    }
  };

  // Keyboard: j/k move, e done, r/a/f/n compose (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select, [contenteditable=true]") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      const ids = rows.flatMap((r) => (r.kind === "conversation" ? [r.c.id] : []));
      const idx = selected ? ids.indexOf(selected) : -1;
      if (e.key === "j" && ids.length) open(ids[Math.min(ids.length - 1, idx + 1)] ?? null);
      else if (e.key === "k" && ids.length) open(ids[Math.max(0, idx - 1)] ?? null);
      else if (current && e.key === "e")
        update((s) => patchConversation(s, current.id, { status: "erledigt" }));
      else if (current && e.key === "r") setComposer({ mode: "reply" });
      else if (current && e.key === "a") setComposer({ mode: "replyAll" });
      else if (current && e.key === "f") setComposer({ mode: "forward" });
      else if (current && e.key === "n") setComposer({ mode: "note" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const actionsPanel = current ? (
    <ActionsPanel
      demo={demo}
      plan={plan}
      standplan={standplan}
      conversation={current}
      messages={currentMessages}
      actions={currentActions}
    />
  ) : null;

  return (
    <div
      ref={rootRef}
      className="grid min-h-[calc(100dvh-180px)] gap-4 lg:grid-cols-[200px_minmax(260px,340px)_minmax(0,1fr)] 2xl:grid-cols-[200px_340px_minmax(0,1fr)_300px]"
    >
      {/* Mailboxes + folders */}
      <nav aria-label={t("nav.label")} className="flex flex-col gap-4 text-small">
        <Link
          href={"/postfach/neu" as Route}
          className="flex min-h-8 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-3 font-medium text-primary-foreground hover:bg-primary-hover"
        >
          <SquarePen className="size-4" />
          {t("nav.new")}
        </Link>
        <div className="flex flex-col gap-0.5">
          <h2 className="px-2 font-medium text-faint-foreground text-tiny uppercase tracking-wide">
            {t("nav.mailboxes")}
          </h2>
          {(["alle", ...demo.mailboxes.map((b) => b.id)] as const).map((id) => {
            const b = demo.mailboxes.find((x) => x.id === id);
            return (
              <button
                key={id}
                type="button"
                aria-current={mailbox === id ? "true" : undefined}
                onClick={() => {
                  setMailbox(id);
                  syncUrl({ mailbox: id });
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover",
                  mailbox === id && "bg-selected font-semibold",
                )}
              >
                <Inbox className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={b?.address}>
                  {b ? b.address.split("@")[0] : t("nav.all")}
                </span>
                <span className="text-muted-foreground tabular-nums">{boxOpen(id) || ""}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-0.5">
          <h2 className="px-2 font-medium text-faint-foreground text-tiny uppercase tracking-wide">
            {t("nav.folders")}
          </h2>
          {FOLDERS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-current={folder === key ? "true" : undefined}
              onClick={() => {
                setFolder(key);
                syncUrl({ folder: key });
              }}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover",
                folder === key && "bg-selected font-semibold",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{t(`folder.${key}`)}</span>
              <span className="text-muted-foreground tabular-nums">{counts[key] || ""}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 px-2">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              syncUrl({ mine: e.target.checked });
            }}
          />
          {t("nav.mine")}
        </label>
        <div className="mt-auto hidden flex-col gap-2 px-2 lg:flex">
          <p className="text-faint-foreground text-tiny">{t("nav.demoNote")}</p>
          <p className="text-faint-foreground text-tiny">{t("nav.keys")}</p>
          <Button size="sm" variant="ghost" onClick={reset} className="self-start">
            {t("nav.reset")}
          </Button>
        </div>
      </nav>

      {/* List */}
      <section
        aria-label={t("list.label")}
        className="flex min-h-0 flex-col rounded-xl border bg-card"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => syncUrl({ q })}
              placeholder={t("list.search")}
              aria-label={t("list.search")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[calc(100dvh-240px)] overflow-y-auto">
          <ConversationList
            demo={demo}
            rows={rows}
            selectedId={selected}
            onOpen={open}
            onOpenDraft={openDraft}
          />
        </div>
      </section>

      {/* Conversation */}
      <section aria-label={t("thread.label")} className="min-w-0">
        {current ? (
          <ThreadView
            demo={demo}
            plan={plan}
            standplan={standplan}
            conversation={current}
            messages={currentMessages}
            actions={currentActions}
            composer={composer}
            onCompose={(mode) => setComposer({ mode })}
            onCloseComposer={() => setComposer(null)}
            onShowActions={() => setActionsOpen(true)}
          />
        ) : (
          <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-small">
            {t("thread.pick")}
          </p>
        )}
      </section>

      {/* Actions: own column on wide screens, a dialog below */}
      <aside aria-label={t("actions.label")} className="hidden 2xl:block">
        {actionsPanel}
      </aside>
      {actionsOpen && current && (
        <Modal
          open
          onOpenChange={(o) => !o && setActionsOpen(false)}
          title={t("actions.label")}
          closeLabel={t("actions.close")}
          className="max-w-lg"
        >
          {actionsPanel}
        </Modal>
      )}
    </div>
  );
}
