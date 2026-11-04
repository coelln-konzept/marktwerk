"use client";

import { autoAssign, type ConversationStatus, nextStatus } from "@marktwerk/core";
import { useCallback, useSyncExternalStore } from "react";
import type {
  ActionEntry,
  Address,
  Conversation,
  Draft,
  KnownSender,
  MailboxId,
  MailDemo,
  MailTemplate,
  Message,
  Person,
} from "./types";

/**
 * PROTOTYPE store of the Postfach: only changes and additions on top of the server demo data, in
 * localStorage (shared across tabs). "Demo zurücksetzen" clears it.
 */
export interface MailState {
  v: 1;
  conv: Record<string, Partial<Conversation>>;
  /** Conversations created here (new mails). */
  newConversations: Conversation[];
  messages: Message[];
  drafts: Draft[];
  /** Edited templates; null = deleted. */
  templates: Record<string, MailTemplate | null>;
  signatures: Partial<Record<MailboxId, string>>;
  actions: ActionEntry[];
  knownSenders: KnownSender[];
  /** Attachments filed by an action: attachment id → label. */
  filed: Record<string, string>;
}

const KEY = "marktwerk.postfach-prototype.v1";
const EMPTY: MailState = {
  v: 1,
  conv: {},
  newConversations: [],
  messages: [],
  drafts: [],
  templates: {},
  signatures: {},
  actions: [],
  knownSenders: [],
  filed: {},
};

let cache: MailState | null = null;
const listeners = new Set<() => void>();

function read(): MailState {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as MailState) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

/** Returns false when the browser storage is full (large attachments). */
export function writeMailState(next: MailState): boolean {
  cache = next;
  let ok = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    ok = false;
  }
  for (const l of listeners) l();
  return ok;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMailStore() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);
  const update = useCallback((fn: (s: MailState) => MailState) => writeMailState(fn(read())), []);
  const reset = useCallback(() => writeMailState(EMPTY), []);
  return { state, update, reset };
}

/** Snapshot of the current state (for undo from another prototype). */
export function readMailState(): MailState {
  return read();
}

/** Direct access for other prototypes (the Standplan writes confirmations into conversations). */
export function updateMailState(fn: (s: MailState) => MailState): boolean {
  return writeMailState(fn(read()));
}

// --- selectors --------------------------------------------------------------------------------------

export function allConversations(demo: MailDemo, s: MailState): Conversation[] {
  return [...demo.conversations, ...s.newConversations]
    .map((c) => ({ ...c, ...s.conv[c.id] }))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export function messagesOf(demo: MailDemo, s: MailState, conversationId: string): Message[] {
  return [...demo.messages, ...s.messages]
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function templatesOf(demo: MailDemo, s: MailState): MailTemplate[] {
  const base = demo.templates.map((t) => (t.id in s.templates ? s.templates[t.id] : t));
  const added = Object.values(s.templates).filter(
    (t): t is MailTemplate => !!t && !demo.templates.some((d) => d.id === t.id),
  );
  return [...base, ...added].filter((t): t is MailTemplate => !!t);
}

export function signatureOf(demo: MailDemo, s: MailState, mailboxId: MailboxId): string {
  return (
    s.signatures[mailboxId] ?? demo.signatures.find((x) => x.mailboxId === mailboxId)?.html ?? ""
  );
}

export function knownSender(
  demo: MailDemo,
  s: MailState,
  address: string,
): KnownSender | undefined {
  const a = address.toLowerCase();
  return (
    demo.knownSenders.find((k) => k.address === a) ?? s.knownSenders.find((k) => k.address === a)
  );
}

// --- mutations (pure: state in, state out) ------------------------------------------------------------

export const patchConversation = (
  s: MailState,
  id: string,
  patch: Partial<Conversation>,
): MailState => ({
  ...s,
  conv: { ...s.conv, [id]: { ...s.conv[id], ...patch } },
});

export const setStatus = (s: MailState, id: string, status: ConversationStatus) =>
  patchConversation(s, id, { status });

export function addNote(
  s: MailState,
  conversationId: string,
  html: string,
  text: string,
  me: Person,
) {
  const m: Message = {
    id: `note-${Date.now()}`,
    conversationId,
    kind: "note",
    from: { name: me.name, address: "" },
    to: [],
    cc: [],
    html,
    text,
    attachments: [],
    at: new Date().toISOString(),
    authorId: me.id,
  };
  return { ...s, messages: [...s.messages, m] };
}

export function saveDraft(s: MailState, d: Draft): MailState {
  return { ...s, drafts: [d, ...s.drafts.filter((x) => x.id !== d.id)] };
}

export function deleteDraft(s: MailState, id: string): MailState {
  return { ...s, drafts: s.drafts.filter((x) => x.id !== id) };
}

/**
 * Files an outgoing message (the prototype never sends). Creates the conversation for a new mail, applies
 * the status rule and auto-assigns the sender.
 */
export function sendMessage(
  demo: MailDemo,
  s: MailState,
  input: {
    draftId: string | null;
    conversationId: string | null;
    mailboxId: MailboxId;
    from: Address;
    to: Address[];
    cc: Address[];
    subject: string;
    html: string;
    text: string;
    attachments: Message["attachments"];
    eventId: string | null;
    close: boolean;
  },
  me: Person,
): { state: MailState; conversationId: string } {
  const at = new Date().toISOString();
  let next = input.draftId ? deleteDraft(s, input.draftId) : s;
  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = `c-neu-${Date.now()}`;
    const c: Conversation = {
      id: conversationId,
      mailboxId: input.mailboxId,
      subject: input.subject,
      external: input.to[0] ?? { name: "", address: "" },
      status: "offen",
      assigneeId: null,
      eventId: input.eventId,
      unread: false,
      lastActivityAt: at,
    };
    next = { ...next, newConversations: [c, ...next.newConversations] };
  }
  const current = allConversations(demo, next).find((c) => c.id === conversationId);
  const m: Message = {
    id: `out-${Date.now()}`,
    conversationId,
    kind: "outgoing",
    from: input.from,
    to: input.to,
    cc: input.cc,
    html: input.html,
    text: input.text,
    attachments: input.attachments,
    at,
    authorId: me.id,
  };
  next = { ...next, messages: [...next.messages, m] };
  next = patchConversation(next, conversationId, {
    status: nextStatus(current?.status ?? "offen", { kind: input.close ? "sendAndClose" : "send" }),
    assigneeId: autoAssign(current?.assigneeId ?? null, me.id),
    lastActivityAt: at,
    unread: false,
    ...(input.eventId && !current?.eventId ? { eventId: input.eventId } : {}),
  });
  return { state: next, conversationId };
}

/** Prototype button "Antwort simulieren": an incoming reply reopens the conversation. */
export function simulateIncoming(demo: MailDemo, s: MailState, conversationId: string): MailState {
  const c = allConversations(demo, s).find((x) => x.id === conversationId);
  if (!c) return s;
  const at = new Date().toISOString();
  const text = `Hallo,\n\nvielen Dank! Eine kurze Rückfrage noch: Ist der Aufbau auch schon früher möglich?\n\nViele Grüße\n${c.external.name}`;
  const m: Message = {
    id: `in-${Date.now()}`,
    conversationId,
    kind: "incoming",
    from: c.external,
    to: [],
    cc: [],
    html: `<p>Hallo,</p><p>vielen Dank! Eine kurze Rückfrage noch: Ist der Aufbau auch schon früher möglich?</p><p>Viele Grüße<br>${c.external.name}</p>`,
    text,
    attachments: [],
    at,
  };
  return patchConversation({ ...s, messages: [...s.messages, m] }, conversationId, {
    status: nextStatus(c.status, { kind: "incoming" }),
    unread: true,
    lastActivityAt: at,
  });
}

export function logAction(s: MailState, entry: Omit<ActionEntry, "id" | "at">): MailState {
  return {
    ...s,
    actions: [{ ...entry, id: `act-${Date.now()}`, at: new Date().toISOString() }, ...s.actions],
  };
}

/**
 * The Standplan's confirmation mails become outgoing messages in the request's conversation (they used
 * to be a separate "sent" list). Status follows the send rule (→ wartet).
 */
export function appendOutgoing(input: {
  conversationId: string;
  to: Address;
  fromAddress: string;
  subject: string;
  text: string;
  authorId: string;
}) {
  updateMailState((s) => {
    const at = new Date().toISOString();
    const html = input.text
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
      .join("");
    const m: Message = {
      id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId: input.conversationId,
      kind: "outgoing",
      from: { name: "Coelln Konzept – Buchung", address: input.fromAddress },
      to: [input.to],
      cc: [],
      html,
      text: input.text,
      attachments: [],
      at,
      authorId: input.authorId,
    };
    return patchConversation({ ...s, messages: [...s.messages, m] }, input.conversationId, {
      status: "wartet",
      lastActivityAt: at,
    });
  });
}
