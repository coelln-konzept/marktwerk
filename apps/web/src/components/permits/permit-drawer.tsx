import { can } from "@marktwerk/core";
import { Building2, FileQuestion, Landmark } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Facts } from "@/components/ui/vorschau";
import { formatDate, formatMoney, todayIn } from "@/lib/format";
import { getActor } from "@/server/actor";
import { listContactOptions } from "@/server/queries/contacts";
import { getPermit, listStaffOptions } from "@/server/queries/permits";
import { ArchivePermitButton } from "./archive-permit-button";
import { DrawerFrame } from "./drawer-frame";
import { PermitEditForm } from "./permit-edit-form";
import { PermitEvents } from "./permit-events";
import { PermitStateBadge } from "./permit-state-badge";
import { PermitStatusFlow } from "./permit-status-flow";

/**
 * Permit drawer (`?genehmigung=<id>` on the Logbuch): status flow, details, conditions, the events it
 * covers, tasks and fees. Everything that changes data is a client island; this part only reads.
 */
export async function PermitDrawer({ id, closeHref }: { id: string; closeHref: string }) {
  const actor = await getActor();
  const t = await getTranslations("permitDrawer");
  const tTypes = await getTranslations("permitTypes");
  const tCat = await getTranslations("permitCategories");
  const tCad = await getTranslations("permitCadences");
  const locale = await getLocale();
  const permit = await getPermit(actor, id, todayIn());

  if (!permit) {
    return (
      <DrawerFrame
        label={t("label")}
        title={t("notFoundTitle")}
        closeHref={closeHref}
        closeLabel={t("close")}
      >
        <EmptyState icon={FileQuestion} title={t("notFoundTitle")} hint={t("notFoundHint")} />
      </DrawerFrame>
    );
  }

  const canWrite = can(actor.role, "permit", "write") && permit.status !== "superseded";
  const canDelete = can(actor.role, "permit", "delete");
  const canOpenEvents = can(actor.role, "event", "read");
  const [contacts, staff] = canWrite
    ? await Promise.all([listContactOptions(), listStaffOptions()])
    : [[], []];
  const none = <span className="text-faint-foreground">{t("none")}</span>;
  const date = (value: string | null) => (value ? formatDate(value, locale) : none);

  const validity =
    permit.validFrom && permit.validUntil
      ? `${formatDate(permit.validFrom, locale)} – ${formatDate(permit.validUntil, locale)}`
      : permit.validUntil
        ? formatDate(permit.validUntil, locale)
        : permit.validFrom
          ? formatDate(permit.validFrom, locale)
          : null;
  const stickers = permit.deliverablesReceived.stickers;

  return (
    <DrawerFrame
      label={t("label")}
      title={permit.title}
      closeHref={closeHref}
      closeLabel={t("close")}
      badges={
        <>
          <PermitStateBadge state={permit.state} />
          <StatusBadge tone="neutral" icon={permit.category === "city" ? Landmark : Building2}>
            {tCat(permit.category)} · {tTypes(permit.permitType)}
          </StatusBadge>
        </>
      }
    >
      <PermitStatusFlow permitId={permit.id} status={permit.status} canWrite={canWrite} />

      <section aria-labelledby="facts-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="facts-title" className="font-semibold text-foreground-2 text-small">
            {t("facts")}
          </h3>
          {canWrite && (
            <PermitEditForm
              permitId={permit.id}
              initial={{
                title: permit.title,
                referenceNo: permit.referenceNo ?? "",
                authorityContactId: permit.authorityContactId ?? "",
                responsibleStaffMemberId: permit.responsibleStaffMemberId ?? "",
                applyBy: permit.applyBy ?? "",
                appliedAt: permit.appliedAt ?? "",
                expectedDecisionOn: permit.expectedDecisionOn ?? "",
                grantedAt: permit.grantedAt ?? "",
                validFrom: permit.validFrom ?? "",
                validUntil: permit.validUntil ?? "",
                stickers: stickers === undefined ? "" : String(stickers),
                conditions: permit.conditions.join("\n"),
                notes: permit.notes ?? "",
              }}
              deliverables={permit.deliverablesReceived}
              contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
              staff={staff}
            />
          )}
        </div>
        <Facts
          items={[
            {
              label: t("venue"),
              value:
                permit.venueId && permit.venueName ? (
                  <Link
                    href={`/orte/${permit.venueId}` as never}
                    className="font-medium text-accent-soft-foreground hover:underline"
                  >
                    {permit.venueName}
                  </Link>
                ) : (
                  none
                ),
            },
            {
              label: t("authority"),
              value: permit.authority ? (
                <Link
                  href={`/kontakte?vorschau=${permit.authority.id}` as never}
                  className="font-medium text-accent-soft-foreground hover:underline"
                >
                  {permit.authority.name}
                </Link>
              ) : (
                none
              ),
            },
            { label: t("reference"), value: permit.referenceNo ?? none },
            {
              label: t("season"),
              value: permit.season ?? none,
            },
            {
              label: t("cadence"),
              value: permit.requirement ? tCad(permit.requirement.cadence) : none,
            },
            { label: t("applyBy"), value: <span className="tabular">{date(permit.applyBy)}</span> },
            {
              label: t("appliedAt"),
              value: <span className="tabular">{date(permit.appliedAt)}</span>,
            },
            {
              label: t("decision"),
              value: <span className="tabular">{date(permit.expectedDecisionOn)}</span>,
            },
            {
              label: t("grantedAt"),
              value: <span className="tabular">{date(permit.grantedAt)}</span>,
            },
            {
              label: t("validity"),
              value: validity ? (
                <span className="tabular">{validity}</span>
              ) : (
                <span className="text-muted-foreground">{t("validityOpen")}</span>
              ),
            },
            {
              label: t("fee"),
              value:
                permit.fees.length > 0 ? (
                  <span className="tabular">{formatMoney(permit.feeCents, locale)}</span>
                ) : permit.requirement?.typicalFeeCents != null ? (
                  <span className="tabular text-muted-foreground">
                    {t("feeTypical", {
                      amount: formatMoney(permit.requirement.typicalFeeCents, locale),
                    })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("feeNone")}</span>
                ),
            },
            { label: t("stickers"), value: stickers ?? none },
            { label: t("responsible"), value: permit.responsibleName ?? none },
            ...(permit.supersedes
              ? [
                  {
                    label: t("replaces"),
                    value: (
                      <Link
                        href={`/logbuch?genehmigung=${permit.supersedes.id}` as never}
                        className="font-medium text-accent-soft-foreground hover:underline"
                      >
                        {permit.supersedes.title}
                      </Link>
                    ),
                  },
                ]
              : []),
            ...(permit.notes
              ? [
                  {
                    label: t("notes"),
                    value: <span className="whitespace-pre-line">{permit.notes}</span>,
                  },
                ]
              : []),
          ]}
        />
      </section>

      <section aria-labelledby="conditions-title" className="flex flex-col gap-2">
        <h3 id="conditions-title" className="font-semibold text-foreground-2 text-small">
          {t("conditions")}
        </h3>
        {permit.conditions.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("conditionsEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-small">
            {permit.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </section>

      <PermitEvents
        permitId={permit.id}
        events={permit.events.map((e) => ({
          id: e.id,
          name: e.name,
          startsOn: e.startsOn,
          required: e.required,
        }))}
        candidates={permit.linkableEvents}
        canWrite={canWrite}
        canOpenEvents={canOpenEvents}
      />

      <section aria-labelledby="tasks-title" className="flex flex-col gap-2">
        <h3 id="tasks-title" className="font-semibold text-foreground-2 text-small">
          {t("tasks")}
        </h3>
        {permit.tasks.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("tasksEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {permit.tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-border-subtle border-b py-1.5 text-small last:border-b-0"
              >
                <Link
                  href={
                    (task.eventId
                      ? `/veranstaltungen/${task.eventId}/board?detail=task:${task.id}`
                      : `/board?detail=task:${task.id}`) as never
                  }
                  className="font-medium text-accent-soft-foreground hover:underline"
                >
                  {task.title}
                </Link>
                <span className="tabular text-muted-foreground text-tiny">
                  {t(`taskStatus.${task.status}` as never)} ·{" "}
                  {task.dueAt
                    ? t("taskDue", { date: formatDate(task.dueAt.slice(0, 10), locale) })
                    : t("taskNoDue")}
                  {task.assigneeName ? ` · ${task.assigneeName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fees-title" className="flex flex-col gap-2">
        <h3 id="fees-title" className="font-semibold text-foreground-2 text-small">
          {t("fees")}
        </h3>
        {permit.fees.length === 0 ? (
          <p className="text-muted-foreground text-small">{t("feesEmpty")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 text-small">
            {permit.fees.map((fee) => (
              <li key={fee.id} className="flex justify-between gap-2 py-1">
                <span>{fee.title}</span>
                <span className="tabular">{formatMoney(fee.totalGrossCents, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canDelete && (
        <div className="border-border-subtle border-t pt-3">
          <ArchivePermitButton permitId={permit.id} title={permit.title} closeHref={closeHref} />
        </div>
      )}
    </DrawerFrame>
  );
}
