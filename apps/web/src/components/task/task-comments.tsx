"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { postComment } from "@/app/(app)/board/actions";
import { formatInstant } from "@/components/event-detail/format-instant";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { useShell } from "@/components/shell/shell-context";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { StaffOption, TaskDetail } from "@/server/queries/tasks";

/** Comment body with the names of mentioned people picked out. */
function Body({ text, names }: { text: string; names: string[] }) {
  if (names.length === 0) return <>{text}</>;
  const escaped = names
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`@(?:${escaped.join("|")})`, "gi");
  const nodes: React.ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > from) nodes.push(text.slice(from, start));
    nodes.push(
      <span
        key={start}
        className="rounded-sm bg-accent-soft px-0.5 font-medium text-accent-soft-foreground"
      >
        {match[0]}
      </span>,
    );
    from = start + match[0].length;
  }
  if (from < text.length) nodes.push(text.slice(from));
  return <>{nodes}</>;
}

/**
 * Comment thread with @mention: typing "@" offers the staff names; a mentioned person is notified
 * (server side, from the text). Ctrl/⌘+Enter sends.
 */
export function TaskComments({
  taskId,
  comments,
  staff,
  canWrite,
}: {
  taskId: string;
  comments: TaskDetail["comments"];
  staff: StaffOption[];
  canWrite: boolean;
}) {
  const t = useTranslations("tasks.comments");
  const locale = useLocale();
  const { showToast } = useShell();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // "@Ann" right before the caret → suggestions
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  const query =
    at >= 0 && (at === 0 || /\s/.test(before[at - 1] ?? "")) ? before.slice(at + 1) : null;
  const suggestions =
    query !== null && query.length <= 30 && !query.includes("\n")
      ? staff.filter((s) => s.displayName.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
      : [];

  function insert(person: StaffOption) {
    const next = `${text.slice(0, at)}@${person.displayName} ${text.slice(caret)}`;
    const position = at + person.displayName.length + 2;
    setText(next);
    setCaret(position);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
    });
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await postComment(taskId, body);
      if (!result.ok) {
        showToast({ message: t("failed") });
        return;
      }
      setText("");
      setCaret(0);
      showToast({
        message:
          result.data.mentioned.length > 0
            ? t("sentMentioned", { count: result.data.mentioned.length })
            : t("sent"),
      });
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((active + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insert(suggestions[Math.min(active, suggestions.length - 1)] as StaffOption);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setCaret(0);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-small">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span aria-hidden>
                <Avatar name={c.authorName ?? "?"} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-small">
                  <b className="font-semibold">{c.authorName ?? t("someone")}</b>{" "}
                  <time dateTime={c.at} className="text-muted-foreground text-tiny">
                    {formatInstant(new Date(c.at), locale)}
                  </time>
                </span>
                <p className="m-0 whitespace-pre-wrap break-words text-small">
                  <Body text={c.body} names={[...c.mentioned]} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="relative flex flex-col gap-1.5">
          <Label htmlFor={id} className="sr-only">
            {t("label")}
          </Label>
          <textarea
            ref={ref}
            id={id}
            rows={3}
            value={text}
            maxLength={4000}
            placeholder={t("placeholder")}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              setActive(0);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            className={TEXTAREA_CLASS}
          />
          <span role="status" className="sr-only">
            {suggestions.length > 0 ? t("suggestions", { count: suggestions.length }) : ""}
          </span>
          {suggestions.length > 0 && (
            // biome-ignore lint/a11y/useSemanticElements: a labelled group of suggestion buttons
            <div
              role="group"
              aria-label={t("mentionList")}
              className="absolute right-0 bottom-full left-0 z-10 mb-1 flex max-h-48 flex-col overflow-y-auto rounded-lg border bg-popover p-1 shadow-pop"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={i === active ? "true" : undefined}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-small outline-none focus-visible:outline-2 focus-visible:outline-ring",
                    i === active && "bg-hover",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(s);
                  }}
                  onClick={() => insert(s)}
                >
                  <span aria-hidden>
                    <Avatar name={s.displayName} />
                  </span>
                  {s.displayName}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-tiny">{t("hint")}</span>
            <Button
              variant="default"
              size="sm"
              onClick={send}
              disabled={pending || !text.trim()}
              aria-busy={pending}
            >
              <Send aria-hidden />
              {t("send")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
