"use client";

import {
  autoAssign,
  type ConversationStatus,
  nextStatus,
  removeFolder,
  type SpamReason,
  spamCheck,
} from "@marktwerk/core";
import { useCallback, useSyncExternalStore } from "react";
import type {
  ActionEntry,
  Address,
  Conversation,
  Draft,
  KnownSender,
  MailboxId,
  MailDemo,
  MailFolder,
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
  /** Custom folders (nested via parentId). */
  folders: MailFolder[];
  /** Addresses ("x@y.de") or domains ("@y.de") whose mail goes to Spam. */
  blockedSenders: string[];
  /**
   * SIMULATED vendor list additions: people whose stall was confirmed in the Standplan. Until then a form
   * sender stays out of the vendor list (noise and spam never get in). Real build: insert/update `vendor`.
   */
  vendorRegister: RegisteredVendor[];
}

export interface RegisteredVendor {
  email: string;
  name: string;
  companyName: string | null;
  kind: "private" | "commercial";
  phone: string | null;
  registeredAt: string;
  eventIds: string[];
  requestRefs: string[];
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
  folders: [],
  blockedSenders: [],
  vendorRegister: [],
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
  const registered = s.vendorRegister.find((v) => v.email === a);
  return (
    demo.knownSenders.find((k) => k.address === a) ??
    s.knownSenders.find((k) => k.address === a) ??
    (registered
      ? {
          address: a,
          kind: "vendor",
          label: registered.companyName ?? registered.name,
          simulated: true,
        }
      : undefined)
  );
}

/** Spam: a person's decision wins; otherwise the fixed rules on the first incoming mail. */
export function spamOf(
  demo: MailDemo,
  s: MailState,
  c: Conversation,
): { spam: boolean; reasons: SpamReason[]; manual: boolean } {
  if (c.spam !== undefined) return { spam: c.spam, reasons: [], manual: true };
  const first = messagesOf(demo, s, c.id).find((m) => m.kind === "incoming");
  if (!first) return { spam: false, reasons: [], manual: false };
  const req =
    first.parse?.kind === "request"
      ? first.parse.ok
        ? first.parse.request
        : first.parse.partial
      : null;
  const r = spamCheck(
    {
      fromAddress: c.external.address,
      subject: c.subject,
      text: first.text,
      formLengthCm: req?.lengthCm ?? null,
    },
    s.blockedSenders,
  );
  return { ...r, manual: false };
}

/** Booking request: a recognised (or broken) form mail, or a request captured by hand. */
export function isBookingRequest(
  demo: MailDemo,
  s: MailState,
  c: Conversation,
  manualIds: Set<string>,
) {
  return manualIds.has(c.id) || messagesOf(demo, s, c.id).some((m) => m.parse?.kind === "request");
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

// --- folders & spam ----------------------------------------------------------------------------------

export function createFolder(
  s: MailState,
  name: string,
  parentId: string | null,
): { state: MailState; id: string } {
  const id = `f-${Date.now().toString(36)}`;
  return { state: { ...s, folders: [...s.folders, { id, name: name.trim(), parentId }] }, id };
}

export function renameFolder(s: MailState, id: string, name: string): MailState {
  return { ...s, folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)) };
}

/** Deletes a folder: subfolders and its mails move up to the parent folder (or the Posteingang). */
export function deleteFolder(s: MailState, id: string): MailState {
  const parent = s.folders.find((f) => f.id === id)?.parentId ?? null;
  const conv = Object.fromEntries(
    Object.entries(s.conv).map(([k, v]) => [k, v.folderId === id ? { ...v, folderId: parent } : v]),
  );
  return { ...s, folders: removeFolder(s.folders, id), conv };
}

/** Moves a conversation into a folder (null = Posteingang); moving out of Spam means "Kein Spam". */
export function moveToFolder(s: MailState, id: string, folderId: string | null): MailState {
  return patchConversation(s, id, { folderId, spam: false });
}

/** "Spam": moves it to Spam and blocks the sender; "Kein Spam" undoes both. */
export function setSpam(s: MailState, c: Conversation, spam: boolean): MailState {
  const addr = c.external.address.toLowerCase();
  // A form mail comes from our own form address: never block that, only this conversation.
  const blockable = !addr.endsWith("@coelln-konzept.de");
  const blockedSenders = spam
    ? blockable && !s.blockedSenders.includes(addr)
      ? [...s.blockedSenders, addr]
      : s.blockedSenders
    : s.blockedSenders.filter((b) => b !== addr);
  return patchConversation({ ...s, blockedSenders }, c.id, { spam });
}

/** Simulated "add to vendor list" for confirmed stalls of people not yet in the vendor table. */
export type NewVendorEntry = Omit<RegisteredVendor, "registeredAt" | "eventIds" | "requestRefs"> & {
  eventId: string;
  requestRef: string;
};

export function registerVendors(entries: NewVendorEntry[]): { added: number } {
  let added = 0;
  updateMailState((s) => {
    const list = [...s.vendorRegister];
    for (const e of entries) {
      const email = e.email.toLowerCase();
      const cur = list.find((v) => v.email === email);
      if (cur) {
        if (!cur.eventIds.includes(e.eventId)) cur.eventIds = [...cur.eventIds, e.eventId];
        if (!cur.requestRefs.includes(e.requestRef))
          cur.requestRefs = [...cur.requestRefs, e.requestRef];
      } else {
        added++;
        list.push({
          email,
          name: e.name,
          companyName: e.companyName,
          kind: e.kind,
          phone: e.phone,
          registeredAt: new Date().toISOString(),
          eventIds: [e.eventId],
          requestRefs: [e.requestRef],
        });
      }
    }
    return { ...s, vendorRegister: list };
  });
  return { added };
}
