"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { type ConversationStatus, folderPath } from "@marktwerk/core";
import { Inbox, Search, SquarePen } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useShell } from "@/components/shell/shell-context";
import { useStandplanStore } from "@/components/standplan/store";
import type { StandplanData } from "@/components/standplan/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { ActionsPanel } from "./actions-panel";
import { ConversationList, type ListRow } from "./conversation-list";
import { type FolderKey, FolderNav } from "./folder-nav";
import {
  allConversations,
  createFolder,
  deleteFolder,
  isBookingRequest,
  messagesOf,
  moveToFolder,
  patchConversation,
  renameFolder,
  setSpam,
  spamOf,
  useMailStore,
} from "./mail-store";
import { ThreadView } from "./thread-view";
import type { Conversation, Draft, DraftMode, MailboxId, MailDemo } from "./types";

type StatusFilter = "alle" | ConversationStatus;
const STATUS_FILTERS: StatusFilter[] = ["alle", "offen", "wartet", "erledigt"];
const SYSTEM: FolderKey[] = [
  "posteingang",
  "gesendet",
  "entwuerfe",
  "standanfragen",
  "nichterkannt",
  "spam",
];

/**
 * PROTOTYPE light mail browser for the shared mailboxes (spec 2026-11-04). Classic screen: every state
 * (mailbox, folder, status, conversation, search) is in the URL. Folders: Posteingang (not filed), custom
 * folders (nested), Gesendet, Entwürfe; smart folders Standanfragen, Nicht erkannt, Spam.
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
    status: string | null;
    konv: string | null;
    q: string | null;
    mir: boolean;
  };
}) {
  const t = useTranslations("postfach");
  const router = useRouter();
  const { showToast } = useShell();
  const { state, update, reset } = useMailStore();
  const { state: standplan } = useStandplanStore();
  const [mailbox, setMailbox] = useState<MailboxId | "alle">(
    demo.mailboxes.some((b) => b.id === initial.postfach)
      ? (initial.postfach as MailboxId)
      : "alle",
  );
  const [folder, setFolder] = useState<FolderKey>(
    initial.ordner &&
      (SYSTEM.includes(initial.ordner as FolderKey) || initial.ordner.startsWith("f-"))
      ? (initial.ordner as FolderKey)
      : "posteingang",
  );
  const [status, setStatus] = useState<StatusFilter>(
    STATUS_FILTERS.includes(initial.status as StatusFilter)
      ? (initial.status as StatusFilter)
      : "alle",
  );
  const [selected, setSelected] = useState<string | null>(initial.konv);
  const [q, setQ] = useState(initial.q ?? "");
  const [mine, setMine] = useState(initial.mir);
  const [composer, setComposer] = useState<{ mode: DraftMode; resume?: Draft } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [dragging, setDragging] = useState<Conversation | null>(null);

  const syncUrl = (p: {
    mailbox?: typeof mailbox;
    folder?: FolderKey;
    status?: StatusFilter;
    konv?: string | null;
    q?: string;
    mine?: boolean;
  }) => {
    const params = new URLSearchParams();
    const mb = p.mailbox ?? mailbox;
    const f = p.folder ?? folder;
    const st = p.status ?? status;
    const k = p.konv === undefined ? selected : p.konv;
    const query = p.q ?? q;
    const m = p.mine ?? mine;
    if (mb !== "alle") params.set("postfach", mb);
    if (f !== "posteingang") params.set("ordner", f);
    if (st !== "alle") params.set("status", st);
    if (k) params.set("konv", k);
    if (query) params.set("q", query);
    if (m) params.set("mir", "1");
    router.replace(`/postfach${params.size ? `?${params}` : ""}` as Route, { scroll: false });
  };

  const conversations = useMemo(() => allConversations(demo, state), [demo, state]);
  const manualIds = useMemo(
    () => new Set(standplan.manualItems.flatMap((i) => (i.mailId ? [i.mailId] : []))),
    [standplan.manualItems],
  );
  const folderIds = new Set(state.folders.map((f) => f.id));
  const spamById = useMemo(
    () => new Map(conversations.map((c) => [c.id, spamOf(demo, state, c)] as const)),
    [conversations, demo, state],
  );
  const msgs = (id: string) => messagesOf(demo, state, id);
  const isSpam = (c: Conversation) => spamById.get(c.id)?.spam ?? false;
  const filedIn = (c: Conversation) =>
    c.folderId && folderIds.has(c.folderId) ? c.folderId : null;
  const inBox = (c: Conversation) => mailbox === "alle" || c.mailboxId === mailbox;
  const inFolder = (c: Conversation, f: FolderKey): boolean => {
    if (f === "spam") return isSpam(c);
    if (isSpam(c)) return false;
    switch (f) {
      case "posteingang":
        return !filedIn(c);
      case "gesendet":
        return msgs(c.id).some((m) => m.kind === "outgoing");
      case "standanfragen":
        return isBookingRequest(demo, state, c, manualIds);
      case "nichterkannt":
        return msgs(c.id).some((m) => m.parse?.kind === "request" && !m.parse.ok);
      case "entwuerfe":
        return false;
      default:
        return filedIn(c) === f;
    }
  };
  const matches = (c: Conversation) => {
    if (mine && c.assigneeId !== demo.me.id) return false;
    if (status !== "alle" && c.status !== status) return false;
    if (!q.trim()) return true;
    const hay = `${c.subject} ${c.external.name} ${c.external.address} ${msgs(c.id)
      .map((m) => m.text)
      .join(" ")}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .every((w) => hay.includes(w));
  };

  const drafts = state.drafts.filter((d) => mailbox === "alle" || d.mailboxId === mailbox);
  // Counts: open conversations per folder (Spam and Gesendet: all), like unread counters in a mail client.
  const counts: Record<string, number> = {};
  for (const key of [...SYSTEM, ...state.folders.map((f) => f.id as FolderKey)]) {
    counts[key] =
      key === "entwuerfe"
        ? drafts.length
        : conversations.filter(
            (c) =>
              inBox(c) &&
              inFolder(c, key) &&
              (key === "spam" || key === "gesendet" || c.status === "offen"),
          ).length;
  }
  const boxOpen = (id: MailboxId | "alle") =>
    conversations.filter(
      (c) => (id === "alle" || c.mailboxId === id) && c.status === "offen" && !isSpam(c),
    ).length;
  const folderLabel = (c: Conversation) => {
    const f = filedIn(c);
    return f
      ? folderPath(state.folders, f)
          .map((x) => x.name)
          .join(" › ")
      : undefined;
  };

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
              spam: isSpam(c),
              folderLabel:
                folder === "posteingang" || folder.startsWith("f-") ? undefined : folderLabel(c),
            };
          });
  const statusCount = (s: StatusFilter) =>
    conversations.filter(
      (c) =>
        inBox(c) &&
        inFolder(c, folder) &&
        (s === "alle" || c.status === s) &&
        (!mine || c.assigneeId === demo.me.id),
    ).length;

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

  const folderName = (key: string) =>
    key === "posteingang" || key === "spam"
      ? t(`folders.${key}`)
      : folderPath(state.folders, key)
          .map((f) => f.name)
          .join(" › ");

  /** Move (drag, menu or keyboard), with undo. Dropping on Spam marks spam and blocks the sender. */
  const moveTo = (c: Conversation, target: string) => {
    const before = state;
    if (target === "spam") update((s) => setSpam(s, c, true));
    else update((s) => moveToFolder(s, c.id, target === "posteingang" ? null : target));
    showToast({
      message: t("toast.moved", { subject: c.subject, folder: folderName(target) }),
      actionLabel: t("undo"),
      onAction: () => void update(() => before),
    });
  };

  // Drag and drop (dnd-kit, as on the Board: ADR 0020).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const convOf = (id: string | number) => conversations.find((c) => `conv:${c.id}` === String(id));
  const targetOf = (id: string | number | undefined) =>
    id && String(id).startsWith("folder:") ? String(id).slice("folder:".length) : null;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("dnd.start", { subject: convOf(active.id)?.subject ?? "" }),
    onDragOver: ({ over }) => {
      const tgt = targetOf(over?.id);
      return tgt ? t("dnd.over", { folder: folderName(tgt) }) : t("dnd.none");
    },
    onDragEnd: ({ over }) => {
      const tgt = targetOf(over?.id);
      return tgt ? t("dnd.dropped", { folder: folderName(tgt) }) : t("dnd.cancelled");
    },
    onDragCancel: () => t("dnd.cancelled"),
  };
  const onDragStart = (e: DragStartEvent) => setDragging(convOf(e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const c = convOf(e.active.id);
    const tgt = targetOf(e.over?.id);
    if (!c || !tgt) return;
    const already =
      tgt === "spam"
        ? isSpam(c)
        : tgt === "posteingang"
          ? !filedIn(c) && !isSpam(c)
          : filedIn(c) === tgt && !isSpam(c);
    if (!already) moveTo(c, tgt);
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
    <DndContext
      id="postfach-dnd"
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("dnd.instructions") },
      }}
    >
      <div className="grid min-h-[calc(100dvh-180px)] gap-4 lg:grid-cols-[220px_minmax(260px,340px)_minmax(0,1fr)] 2xl:grid-cols-[220px_340px_minmax(0,1fr)_300px]">
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
          <FolderNav
            folders={state.folders}
            active={folder}
            counts={counts}
            onSelect={(key) => {
              setFolder(key);
              syncUrl({ folder: key });
            }}
            onCreate={(name, parentId) => {
              let id = "";
              update((s) => {
                const r = createFolder(s, name, parentId);
                id = r.id;
                return r.state;
              });
              showToast({ message: t("toast.folderCreated", { name }) });
              if (id) {
                setFolder(id as FolderKey);
                syncUrl({ folder: id as FolderKey });
              }
            }}
            onRename={(id, name) => update((s) => renameFolder(s, id, name))}
            onDelete={(f) => {
              const before = state;
              update((s) => deleteFolder(s, f.id));
              if (folder === f.id) {
                setFolder("posteingang");
                syncUrl({ folder: "posteingang" });
              }
              showToast({
                message: t("toast.folderDeleted", { name: f.name }),
                actionLabel: t("undo"),
                onAction: () => void update(() => before),
              });
            }}
          />
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
            <p className="text-faint-foreground text-tiny">{t("nav.dragHint")}</p>
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
          <div className="flex flex-col gap-2 border-b p-2">
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
            {folder !== "entwuerfe" && (
              // biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons, as in FilterBar
              <div
                role="group"
                aria-label={t("list.statusFilter")}
                className="flex flex-wrap gap-1"
              >
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => {
                      setStatus(s);
                      syncUrl({ status: s });
                    }}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-tiny",
                      status === s ? "border-primary bg-selected font-semibold" : "hover:bg-hover",
                    )}
                  >
                    {s === "alle" ? t("list.all") : t(`status.${s}`)}{" "}
                    <span className="text-muted-foreground">{statusCount(s)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-[calc(100dvh-280px)] overflow-y-auto">
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
              folders={state.folders}
              filedIn={filedIn(current)}
              spam={spamById.get(current.id) ?? { spam: false, reasons: [], manual: false }}
              onMove={(target) => moveTo(current, target)}
              onSpam={(spam) => {
                const before = state;
                update((s) => setSpam(s, current, spam));
                showToast({
                  message: spam ? t("toast.spam") : t("toast.notSpam"),
                  actionLabel: t("undo"),
                  onAction: () => void update(() => before),
                });
              }}
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
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="max-w-72 rounded-lg border border-primary bg-card px-3 py-2 text-small shadow-lg">
            <p className="truncate font-semibold">
              {dragging.external.name || dragging.external.address}
            </p>
            <p className="truncate text-muted-foreground">{dragging.subject}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
