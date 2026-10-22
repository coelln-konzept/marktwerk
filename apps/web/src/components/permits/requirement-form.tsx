"use client";

import { PERMIT_CADENCES } from "@marktwerk/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import {
  archiveRequirementAction,
  createRequirementAction,
  updateRequirementAction,
} from "@/app/(app)/orte/[id]/genehmigungen/actions";
import { TEXTAREA_CLASS } from "@/components/event-detail/textarea-class";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { centsToInput, parseMoneyToCents } from "@/lib/format";
import { dayMonthInput, parseDayMonth } from "@/lib/month-day";
import { PERMIT_TYPE_KEYS } from "@/lib/permit-status";
import type { RequirementInput } from "@/server/services/permit-requirements";

type Field =
  | "title"
  | "category"
  | "permitType"
  | "cadence"
  | "leadTimeDays"
  | "windowStart"
  | "windowEnd"
  | "decision"
  | "fee"
  | "stickers"
  | "authority"
  | "eventType"
  | "notes"
  | "form";

const ERROR_FIELD: Record<string, Field> = {
  invalid_title: "title",
  invalid_category: "category",
  invalid_type: "permitType",
  invalid_cadence: "cadence",
  invalid_lead_time: "leadTimeDays",
  invalid_fee: "fee",
  invalid_month_day: "windowStart",
  invalid_event_type: "eventType",
  invalid_contact: "authority",
  invalid_deliverables: "stickers",
  invalid_text: "notes",
};

/**
 * Create / edit a permit requirement of a venue. About a dozen fields, so a page rather than a modal
 * (UX concept §4). Saving a change shows an undo toast that writes the previous values back.
 */
export function RequirementForm({
  venueId,
  requirementId,
  initial,
  contacts,
  eventTypes,
}: {
  venueId: string;
  requirementId?: string;
  initial?: RequirementInput;
  contacts: { id: string; name: string }[];
  eventTypes: { id: string; name: string }[];
}) {
  const t = useTranslations("requirements");
  const tForm = useTranslations("requirements.form");
  const tTypes = useTranslations("permitTypes");
  const tCat = useTranslations("permitCategories");
  const tCad = useTranslations("permitCadences");
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useShell();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ field: Field; code: string } | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<RequirementInput["category"]>(
    initial?.category ?? "city",
  );
  const [permitType, setPermitType] = useState<RequirementInput["permitType"]>(
    initial?.permitType ?? "market_permit",
  );
  const [eventTypeId, setEventTypeId] = useState(initial?.eventTypeId ?? "");
  const [authority, setAuthority] = useState(initial?.authorityContactId ?? "");
  const [cadence, setCadence] = useState<RequirementInput["cadence"]>(
    initial?.cadence ?? "per_season",
  );
  const [leadTime, setLeadTime] = useState(String(initial?.leadTimeDays ?? 30));
  const [windowStart, setWindowStart] = useState(
    dayMonthInput(initial?.submissionWindowStartMd ?? null),
  );
  const [windowEnd, setWindowEnd] = useState(dayMonthInput(initial?.submissionWindowEndMd ?? null));
  const [decision, setDecision] = useState(dayMonthInput(initial?.expectedDecisionMd ?? null));
  const [fee, setFee] = useState(centsToInput(initial?.typicalFeeCents ?? null, locale));
  const [stickers, setStickers] = useState(
    initial?.deliverables.stickers ? String(initial.deliverables.stickers) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const fid = (name: string) => `${uid}-${name}`;
  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const invalid = (field: Field) =>
    error?.field === field
      ? { "aria-invalid": true as const, "aria-describedby": fid("error") }
      : {};
  const back = `/orte/${venueId}`;

  function fail(field: Field, code: string) {
    setError({ field, code });
    document.getElementById(fid(field))?.focus();
  }

  function submit() {
    const start = parseDayMonth(windowStart);
    const end = parseDayMonth(windowEnd);
    const decisionMd = parseDayMonth(decision);
    if (start === undefined) return fail("windowStart", "invalid_month_day");
    if (end === undefined) return fail("windowEnd", "invalid_month_day");
    if (decisionMd === undefined) return fail("decision", "invalid_month_day");
    const cents = parseMoneyToCents(fee);
    if (Number.isNaN(cents)) return fail("fee", "invalid_fee");
    const count = stickers.trim() === "" ? 0 : Number(stickers);
    const input: RequirementInput = {
      category,
      permitType,
      title: title.trim() === "" ? tTypes(permitType) : title,
      eventTypeId: eventTypeId === "" ? null : eventTypeId,
      authorityContactId: authority === "" ? null : authority,
      cadence,
      leadTimeDays: leadTime.trim() === "" ? Number.NaN : Number(leadTime),
      submissionWindowStartMd: start,
      submissionWindowEndMd: end,
      expectedDecisionMd: decisionMd,
      typicalFeeCents: cents,
      deliverables: { stickers: count },
      notes: notes.trim() === "" ? null : notes,
    };
    setError(null);
    startTransition(async () => {
      if (!requirementId) {
        const result = await createRequirementAction(venueId, input);
        if (!result.ok) return fail(ERROR_FIELD[result.error] ?? "form", result.error);
        const { id } = result.data;
        showToast({
          message: t("toast.created"),
          actionLabel: t("toast.undo"),
          onAction: async () => {
            await archiveRequirementAction(id);
            showToast({ message: t("toast.createdUndone") });
          },
        });
        router.push(back as never);
        return;
      }
      const result = await updateRequirementAction(requirementId, input);
      if (!result.ok) return fail(ERROR_FIELD[result.error] ?? "form", result.error);
      if (!result.data.changed) {
        showToast({ message: t("toast.unchanged") });
      } else {
        const { previous } = result.data;
        showToast({
          message: t("toast.saved"),
          actionLabel: t("toast.undo"),
          onAction: async () => {
            await updateRequirementAction(requirementId, previous, true);
            showToast({ message: t("toast.reverted") });
          },
        });
      }
      router.push(back as never);
    });
  }

  const field = (name: Field, label: string, control: React.ReactNode, hint?: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fid(name)}>{label}</Label>
      {control}
      {hint && <p className="text-muted-foreground text-tiny">{hint}</p>}
    </div>
  );

  return (
    <form
      noValidate
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Panel>
        <PanelHeader>
          <PanelTitle>{tForm("sectionBasics")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          {field(
            "category",
            tForm("category"),
            <select
              id={fid("category")}
              value={category}
              onChange={(e) => setCategory(e.target.value as RequirementInput["category"])}
              className={SELECT_CLASS}
              {...invalid("category")}
            >
              <option value="city">{tCat("city")}</option>
              <option value="external">{tCat("external")}</option>
            </select>,
          )}
          {field(
            "permitType",
            tForm("type"),
            <select
              id={fid("permitType")}
              value={permitType}
              onChange={(e) => setPermitType(e.target.value as RequirementInput["permitType"])}
              className={SELECT_CLASS}
              {...invalid("permitType")}
            >
              {PERMIT_TYPE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {tTypes(key)}
                </option>
              ))}
            </select>,
          )}
          <div className="sm:col-span-2">
            {field(
              "title",
              tForm("name"),
              <Input
                id={fid("title")}
                value={title}
                maxLength={200}
                placeholder={tTypes(permitType)}
                onChange={(e) => setTitle(e.target.value)}
                {...invalid("title")}
              />,
            )}
          </div>
          {field(
            "eventType",
            tForm("eventType"),
            <select
              id={fid("eventType")}
              value={eventTypeId}
              onChange={(e) => setEventTypeId(e.target.value)}
              className={SELECT_CLASS}
              {...invalid("eventType")}
            >
              <option value="">{tForm("allEventTypes")}</option>
              {eventTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            "authority",
            tForm("authority"),
            <select
              id={fid("authority")}
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              className={SELECT_CLASS}
              {...invalid("authority")}
            >
              <option value="">{tForm("noAuthority")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>,
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>{tForm("sectionTiming")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          {field(
            "cadence",
            tForm("cadence"),
            <select
              id={fid("cadence")}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as RequirementInput["cadence"])}
              className={SELECT_CLASS}
              {...invalid("cadence")}
            >
              {PERMIT_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {tCad(c)}
                </option>
              ))}
            </select>,
            tForm("cadenceHint"),
          )}
          {field(
            "leadTimeDays",
            tForm("leadTime"),
            <Input
              id={fid("leadTimeDays")}
              inputMode="numeric"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              className="tabular"
              {...invalid("leadTimeDays")}
            />,
          )}
          {field(
            "windowStart",
            tForm("windowStart"),
            <Input
              id={fid("windowStart")}
              value={windowStart}
              placeholder="01.10."
              onChange={(e) => setWindowStart(e.target.value)}
              className="tabular"
              {...invalid("windowStart")}
            />,
            tForm("windowHint"),
          )}
          {field(
            "windowEnd",
            tForm("windowEnd"),
            <Input
              id={fid("windowEnd")}
              value={windowEnd}
              placeholder="30.11."
              onChange={(e) => setWindowEnd(e.target.value)}
              className="tabular"
              {...invalid("windowEnd")}
            />,
          )}
          {field(
            "decision",
            tForm("decision"),
            <Input
              id={fid("decision")}
              value={decision}
              placeholder="15.01."
              onChange={(e) => setDecision(e.target.value)}
              className="tabular"
              {...invalid("decision")}
            />,
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>{tForm("sectionExtras")}</PanelTitle>
        </PanelHeader>
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          {field(
            "fee",
            tForm("fee"),
            <Input
              id={fid("fee")}
              inputMode="decimal"
              value={fee}
              placeholder="120"
              onChange={(e) => setFee(e.target.value)}
              className="tabular"
              {...invalid("fee")}
            />,
          )}
          {field(
            "stickers",
            tForm("stickers"),
            <Input
              id={fid("stickers")}
              inputMode="numeric"
              value={stickers}
              onChange={(e) => setStickers(e.target.value)}
              className="tabular"
              {...invalid("stickers")}
            />,
          )}
          <div className="sm:col-span-2">
            {field(
              "notes",
              tForm("notes"),
              <textarea
                id={fid("notes")}
                rows={3}
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={TEXTAREA_CLASS}
                {...invalid("notes")}
              />,
            )}
          </div>
        </PanelBody>
      </Panel>

      {error && (
        <p id={fid("error")} role="alert" className="text-small text-status-critical">
          {errorText(error.code)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending}>
          {pending ? tForm("saving") : tForm("save")}
        </Button>
        <Link href={back as never} className={buttonVariants({ variant: "outline" })}>
          {tForm("cancel")}
        </Link>
      </div>
    </form>
  );
}
