"use client";

import { stallNumber } from "@marktwerk/core";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FileWarning,
  Inbox,
  type LucideIcon,
  Mail,
  MailCheck,
  MapPinned,
  Send,
  TriangleAlert,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateWithWeekday, formatLength } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type SentMail, type StoredPlacement, useStandplanStore } from "./store";
import type { InboxMail, StandplanData } from "./types";

type Folder = "all" | "requests" | "errors" | "other" | "sent";

const FOLDERS: { key: Folder; icon: LucideIcon }[] = [
  { key: "all", icon: Inbox },
  { key: "requests", icon: MapPinned },
  { key: "errors", icon: FileWarning },
  { key: "other", icon: Mail },
  { key: "sent", icon: Send },
];

/**
 * Prototype of the Postfach (wireframes "Outlook-like list + reading area"). Mails come from the demo
 * loader; in the real build from the shared M365 mailbox (ADR 0008). Form requests are recognised by the
 * deterministic parser (ADR 0014) and show the original next to the extracted fields (research 08 §A).
 */
export function PostfachView({
  mails,
  data,
  initialFolder,
  initialMailId,
}: {
  mails: InboxMail[];
  data: StandplanData;
  initialFolder: string | null;
  initialMailId: string | null;
}) {
  const t = useTranslations("postfach");
  const locale = useLocale();
  const router = useRouter();
  const { state } = useStandplanStore();
  const [folder, setFolder] = useState<Folder>(
    FOLDERS.some((f) => f.key === initialFolder) ? (initialFolder as Folder) : "all",
  );
  const [selected, setSelected] = useState<string | null>(initialMailId);

  const go = (f: Folder, id: string | null) => {
    setFolder(f);
    setSelected(id);
    const q = new URLSearchParams();
    if (f !== "all") q.set("ordner", f);
    if (id) q.set("mail", id);
    router.replace(`/postfach${q.size ? `?${q}` : ""}` as Route, { scroll: false });
  };

  const isReq = (m: InboxMail) => m.parse.kind === "request";
  const isErr = (m: InboxMail) => m.parse.kind === "request" && !m.parse.ok;
  const counts: Record<Folder, number> = {
    all: mails.length,
    requests: mails.filter((m) => isReq(m) && !isErr(m)).length,
    errors: mails.filter(isErr).length,
    other: mails.filter((m) => !isReq(m)).length,
    sent: state.sent.length,
  };
  const list = mails.filter((m) =>
    folder === "requests"
      ? isReq(m) && !isErr(m)
      : folder === "errors"
        ? isErr(m)
        : folder === "other"
          ? !isReq(m)
          : true,
  );

  /** Per mail: how far its dates are (open / proposed / confirmed), from the plan store. */
  const progress = useMemo(() => {
    const out = new Map<string, { total: number; placed: number; confirmed: number }>();
    for (const item of data.items) {
      if (!item.mailId) continue;
      const pl = placementOf(state.placements, data, item.eventId, item.id);
      const cur = out.get(item.mailId) ?? { total: 0, placed: 0, confirmed: 0 };
      cur.total++;
      if (pl) cur.placed++;
      if (pl?.status === "assigned") cur.confirmed++;
      out.set(item.mailId, cur);
    }
    return out;
  }, [data, state.placements]);

  const mail = folder !== "sent" ? mails.find((m) => m.id === selected) : undefined;
  const sentMail = folder === "sent" ? state.sent.find((m) => m.id === selected) : undefined;

  return (
    <div className="grid min-h-[calc(100dvh-200px)] gap-4 lg:grid-cols-[200px_minmax(260px,360px)_minmax(0,1fr)]">
      <nav aria-label={t("folders")} className="flex flex-row gap-1 overflow-x-auto lg:flex-col">
        {FOLDERS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-current={folder === key ? "page" : undefined}
            onClick={() => go(key, null)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-small hover:bg-hover",
              folder === key && "bg-selected font-semibold",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">{t(`folder.${key}`)}</span>
            <span className="text-muted-foreground tabular-nums">{counts[key]}</span>
          </button>
        ))}
        <p className="mt-4 hidden text-faint-foreground text-tiny lg:block">{t("demoNote")}</p>
      </nav>

      <ul className="flex max-h-[calc(100dvh-200px)] flex-col overflow-y-auto rounded-xl border bg-card">
        {folder === "sent"
          ? state.sent.map((m) => (
              <li key={m.id}>
                <MailRow
                  active={selected === m.id}
                  onClick={() => go("sent", m.id)}
                  from={t("to", { name: m.toName })}
                  subject={m.subject}
                  date={m.sentAt}
                  badge={
                    <StatusBadge tone="ok" icon={MailCheck}>
                      {t("badge.sent")}
                    </StatusBadge>
                  }
                />
              </li>
            ))
          : list.map((m) => {
              const p = progress.get(m.id);
              const badge = isErr(m) ? (
                <StatusBadge tone="critical" icon={CircleAlert}>
                  {t("badge.parseError")}
                </StatusBadge>
              ) : isReq(m) ? (
                p && p.confirmed === p.total ? (
                  <StatusBadge tone="ok" icon={CircleCheck}>
                    {t("badge.confirmed")}
                  </StatusBadge>
                ) : p && p.placed > 0 ? (
                  <StatusBadge tone="warn" icon={CircleDashed}>
                    {t("badge.inProgress", { placed: p.placed, total: p.total })}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="info" icon={MapPinned}>
                    {t("badge.request")}
                  </StatusBadge>
                )
              ) : null;
              return (
                <li key={m.id}>
                  <MailRow
                    active={selected === m.id}
                    onClick={() => go(folder, m.id)}
                    from={m.fromName}
                    subject={m.subject}
                    date={m.receivedAt}
                    badge={badge}
                  />
                </li>
              );
            })}
        {(folder === "sent" ? state.sent.length : list.length) === 0 && (
          <li className="p-6 text-center text-muted-foreground text-small">{t("empty")}</li>
        )}
      </ul>

      <section aria-label={t("reading")} className="min-w-0 rounded-xl border bg-card">
        {mail ? (
          <MailReader mail={mail} data={data} placements={state.placements} locale={locale} />
        ) : sentMail ? (
          <SentReader mail={sentMail} />
        ) : (
          <p className="p-8 text-center text-muted-foreground text-small">{t("pick")}</p>
        )}
      </section>
    </div>
  );
}

function placementOf(
  placements: Record<string, StoredPlacement[]>,
  data: StandplanData,
  eventId: string,
  itemId: string,
): StoredPlacement | undefined {
  const list =
    placements[eventId] ??
    (data.existing[eventId] ?? []).map((p) => ({ ...p, status: "assigned" as const }));
  return list.find((p) => p.itemId === itemId);
}

function MailRow({
  active,
  onClick,
  from,
  subject,
  date,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  from: string;
  subject: string;
  date: string;
  badge: React.ReactNode;
}) {
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left text-small hover:bg-hover",
        active && "bg-selected",
      )}
    >
      <span className="flex items-baseline gap-2">
        <span className="truncate font-semibold">{from}</span>
        <span className="ml-auto shrink-0 text-faint-foreground text-tiny">
          {new Date(date).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </span>
      <span className="truncate">{subject}</span>
      {badge && <span className="mt-0.5">{badge}</span>}
    </button>
  );
}

function MailReader({
  mail,
  data,
  placements,
  locale,
}: {
  mail: InboxMail;
  data: StandplanData;
  placements: Record<string, StoredPlacement[]>;
  locale: string;
}) {
  const t = useTranslations("postfach");
  const header = (
    <header className="border-b p-4">
      <h2 className="font-semibold text-base">{mail.subject}</h2>
      <p className="text-muted-foreground text-small">
        {mail.fromName} &lt;{mail.fromAddress}&gt; ·{" "}
        {new Date(mail.receivedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}
      </p>
    </header>
  );
  const original = (
    <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed">
      {mail.body}
    </pre>
  );
  if (mail.parse.kind !== "request") {
    return (
      <>
        {header}
        {original}
      </>
    );
  }
  const p = mail.parse;
  const req = p.ok ? p.request : p.partial;
  const issues = p.ok ? p.warnings : [...p.errors, ...p.warnings];
  const issueFor = (field: string) => issues.find((i) => i.field === field);
  const items = data.items.filter((i) => i.mailId === mail.id);
  const unmatched = data.unmatched.filter((u) => u.mailId === mail.id);

  const fields: [string, string, React.ReactNode][] = [
    ["requestRef", t("field.requestRef"), req.requestRef],
    ["eventName", t("field.eventName"), req.eventName],
    ["dates", t("field.dates"), req.dates?.map((d) => formatDateWithWeekday(d, locale)).join(", ")],
    ["name", t("field.name"), [req.name, req.companyName].filter(Boolean).join(" · ")],
    ["kind", t("field.kind"), req.kind === "commercial" ? t("kind.commercial") : t("kind.private")],
    ["email", t("field.email"), req.email],
    ["lengthCm", t("field.length"), req.lengthCm ? formatLength(req.lengthCm, locale) : null],
    [
      "carRequested",
      t("field.car"),
      req.carRequested
        ? t("yesLength", { length: formatLength(req.carLengthCm ?? 500, locale) })
        : t("no"),
    ],
    ["power", t("field.power"), req.power ? t("yes") : t("no")],
    ["preferredSpot", t("field.spot"), req.preferredSpot?.raw ?? "–"],
    ["categories", t("field.categories"), req.categories?.join(", ") || "–"],
  ];

  return (
    <>
      {header}
      <div className="grid gap-0 xl:grid-cols-2">
        <div className="border-b xl:border-r xl:border-b-0">
          <h3 className="px-4 pt-3 font-medium text-muted-foreground text-tiny uppercase tracking-wide">
            {t("original")}
          </h3>
          {original}
        </div>
        <div className="flex flex-col gap-3 p-4">
          <h3 className="font-medium text-muted-foreground text-tiny uppercase tracking-wide">
            {t("recognised")}
          </h3>
          {!p.ok && (
            <div
              role="alert"
              className="flex gap-2 rounded-md bg-status-critical-bg p-3 text-small text-status-critical"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">{t("parseFailed")}</p>
                <p>{t("parseFailedHint")}</p>
              </div>
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1.5 text-small">
            {fields.map(([key, label, value]) => {
              const issue = issueFor(key);
              return (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn(issue?.code && !p.ok && "text-status-critical")}>
                    {value || (issue ? `„${issue.value ?? ""}“` : "–")}
                  </dd>
                  <dd>
                    {issue ? (
                      <span
                        title={t(`issue.${issue.code}`)}
                        className={p.ok ? "text-status-warn" : "text-status-critical"}
                      >
                        {p.ok ? (
                          <TriangleAlert className="size-4" />
                        ) : (
                          <CircleAlert className="size-4" />
                        )}
                        <span className="sr-only">{t(`issue.${issue.code}`)}</span>
                      </span>
                    ) : (
                      <CircleCheck className="size-4 text-status-ok" aria-label={t("ok")} />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {req.note && (
            <p className="rounded-md bg-status-warn-bg p-2 text-small text-status-warn">
              <span className="font-semibold">{t("field.note")}: </span>
              <span className="whitespace-pre-wrap">{req.note}</span>
            </p>
          )}
          {p.ok && (
            <div className="flex flex-col gap-2">
              <h3 className="font-medium text-muted-foreground text-tiny uppercase tracking-wide">
                {t("perDate")}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {items.map((item) => {
                  const ev = data.events.find((e) => e.id === item.eventId);
                  const pl = placementOf(placements, data, item.eventId, item.id);
                  const venue = data.venues.find((v) => v.id === ev?.venueId);
                  const row = venue?.zones.flatMap((z) => z.rows).find((r) => r.id === pl?.rowId);
                  return (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-small"
                    >
                      <span className="font-medium">
                        {ev ? formatDateWithWeekday(ev.startsOn, locale) : ""}
                      </span>
                      {pl && row ? (
                        pl.status === "assigned" ? (
                          <StatusBadge tone="ok" icon={CircleCheck}>
                            {t("dateConfirmed", { stall: stallNumber(row.label, pl.startCm) })}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="warn" icon={CircleDashed}>
                            {t("dateProposed", { stall: stallNumber(row.label, pl.startCm) })}
                          </StatusBadge>
                        )
                      ) : (
                        <StatusBadge tone="info" icon={MapPinned}>
                          {t("dateOpen")}
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
                {unmatched.map((u) => (
                  <li
                    key={u.date}
                    className="flex items-center gap-2 rounded-md border border-status-warn-dot p-2 text-small text-status-warn"
                  >
                    <TriangleAlert className="size-4" />
                    {t("noEvent", { name: u.eventName, date: u.date })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SentReader({ mail }: { mail: SentMail }) {
  const t = useTranslations("postfach");
  const locale = useLocale();
  return (
    <>
      <header className="border-b p-4">
        <h2 className="font-semibold text-base">{mail.subject}</h2>
        <p className="text-muted-foreground text-small">
          {t("to", { name: `${mail.toName} <${mail.toAddress}>` })} ·{" "}
          {new Date(mail.sentAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}
        </p>
        <p className="mt-1 text-faint-foreground text-tiny">{t("sentNote")}</p>
      </header>
      <pre className="whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed">
        {mail.body}
      </pre>
    </>
  );
}
