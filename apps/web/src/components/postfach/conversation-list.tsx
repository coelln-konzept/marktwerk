"use client";

import { Paperclip, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ConversationStatusBadge } from "./status";
import type { Conversation, Draft, MailDemo, Message } from "./types";

export type ListRow =
  | {
      kind: "conversation";
      c: Conversation;
      last: Message | undefined;
      count: number;
      attach: boolean;
    }
  | { kind: "draft"; d: Draft; c: Conversation | undefined };

const time = (iso: string, locale: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(
    locale === "de" ? "de-DE" : "en-GB",
    sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" },
  );
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function ConversationList({
  demo,
  rows,
  selectedId,
  onOpen,
  onOpenDraft,
}: {
  demo: MailDemo;
  rows: ListRow[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onOpenDraft: (d: Draft) => void;
}) {
  const t = useTranslations("postfach.list");
  const locale = useLocale();
  if (rows.length === 0) {
    return <p className="p-6 text-center text-muted-foreground text-small">{t("empty")}</p>;
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        if (row.kind === "draft") {
          const { d, c } = row;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpenDraft(d)}
                className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-small hover:bg-hover"
              >
                <span className="flex items-baseline gap-2">
                  <PenLine className="size-3.5 shrink-0 self-center text-status-warn" />
                  <span className="truncate font-semibold">
                    {d.to.map((a) => a.name || a.address).join(", ") || t("noRecipient")}
                  </span>
                  <span className="ml-auto shrink-0 text-faint-foreground text-tiny">
                    {time(d.updatedAt, locale)}
                  </span>
                </span>
                <span className="truncate">{d.subject || c?.subject || t("noSubject")}</span>
                <span className="text-status-warn text-tiny">{t("draft")}</span>
              </button>
            </li>
          );
        }
        const { c, last, count, attach } = row;
        const assignee = demo.people.find((p) => p.id === c.assigneeId);
        const active = selectedId === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-small hover:bg-hover",
                active && "bg-selected",
              )}
            >
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "size-2 shrink-0 self-center rounded-full",
                    c.unread ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <span className={cn("truncate", c.unread ? "font-bold" : "font-medium")}>
                  {c.external.name || c.external.address}
                </span>
                {c.unread && <span className="sr-only">{t("unread")}</span>}
                <span className="ml-auto shrink-0 text-faint-foreground text-tiny">
                  {time(c.lastActivityAt, locale)}
                </span>
              </span>
              <span className={cn("truncate pl-4", c.unread && "font-semibold")}>{c.subject}</span>
              <span className="truncate pl-4 text-muted-foreground text-tiny">
                {last?.kind === "outgoing" ? `${t("you")}: ` : ""}
                {(last?.text ?? "").replace(/\s+/g, " ").slice(0, 90)}
              </span>
              <span className="mt-0.5 flex items-center gap-2 pl-4">
                <ConversationStatusBadge status={c.status} />
                {assignee && (
                  <span
                    title={assignee.name}
                    className="inline-flex size-5 items-center justify-center rounded-full bg-sunken font-semibold text-[10px]"
                  >
                    {initials(assignee.name)}
                    <span className="sr-only">{t("assignedTo", { name: assignee.name })}</span>
                  </span>
                )}
                {count > 1 && <span className="text-faint-foreground text-tiny">⇄ {count}</span>}
                {attach && (
                  <Paperclip
                    className="size-3.5 text-faint-foreground"
                    aria-label={t("attachments")}
                  />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
