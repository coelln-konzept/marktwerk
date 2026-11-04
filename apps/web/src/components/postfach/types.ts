/**
 * PROTOTYPE shapes of the Postfach mail browser (spec 2026-11-04). Server demo data is the base; the
 * browser store (`mail-store.ts`) keeps only changes and additions. Production tables: mailbox,
 * email_thread, email_message, thread_link, reply_template, mailbox_signature, thread_note.
 */
import type { ConversationStatus } from "@marktwerk/core";
import type { InboxMail } from "@/components/standplan/types";

export type MailboxId = "buchung" | "info" | "genehmigungen";

export interface Mailbox {
  id: MailboxId;
  address: string;
  label: string;
}

export interface Address {
  name: string;
  address: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** Inline data so "öffnen" works in the prototype. */
  dataUrl?: string;
}

export type MessageKind = "incoming" | "outgoing" | "note";

export interface Message {
  id: string;
  conversationId: string;
  kind: MessageKind;
  from: Address;
  to: Address[];
  cc: Address[];
  html: string;
  text: string;
  attachments: Attachment[];
  at: string;
  /** Person who wrote an outgoing message or note. */
  authorId?: string;
  /** Deterministic parse result for website-form stall requests. */
  parse?: InboxMail["parse"];
}

export interface Conversation {
  id: string;
  mailboxId: MailboxId;
  subject: string;
  /** The other side of the conversation (vendor, authority, supplier). */
  external: Address;
  status: ConversationStatus;
  assigneeId: string | null;
  eventId: string | null;
  unread: boolean;
  lastActivityAt: string;
}

export type DraftMode = "reply" | "replyAll" | "forward" | "new" | "note";

export interface Draft {
  id: string;
  conversationId: string | null;
  mailboxId: MailboxId;
  mode: DraftMode;
  to: Address[];
  cc: Address[];
  subject: string;
  html: string;
  attachments: Attachment[];
  includeSignature: boolean;
  includeEventBlock: boolean;
  /** Message quoted under a reply/forward. */
  quoteOf: string | null;
  eventId: string | null;
  updatedAt: string;
}

export type TemplateCategory = "buchung" | "genehmigung" | "allgemein";

export interface MailTemplate {
  id: string;
  name: string;
  mailboxId: MailboxId | null;
  category: TemplateCategory;
  subject: string | null;
  html: string;
}

export interface Signature {
  mailboxId: MailboxId;
  html: string;
}

export type ActionKind =
  | "contact"
  | "vendor"
  | "stallRequest"
  | "permit"
  | "venueDocument"
  | "linkEvent";

export interface ActionEntry {
  id: string;
  conversationId: string;
  kind: ActionKind;
  summary: string;
  at: string;
  authorId: string;
  /** Attachment the action filed, if any. */
  attachmentId?: string;
}

export interface KnownSender {
  address: string;
  kind: "contact" | "vendor";
  label: string;
  /** Record id when it exists in the database (read-only lookup). */
  id?: string;
  /** Simulated in this browser. */
  simulated?: boolean;
}

export interface Person {
  id: string;
  name: string;
}

export interface PermitOption {
  id: string;
  venueId: string;
  title: string;
  status: string;
  season: number | null;
}

export interface MailDemo {
  mailboxes: Mailbox[];
  conversations: Conversation[];
  messages: Message[];
  templates: MailTemplate[];
  signatures: Signature[];
  knownSenders: KnownSender[];
  people: Person[];
  me: Person;
  permits: PermitOption[];
  venues: { id: string; name: string }[];
}
