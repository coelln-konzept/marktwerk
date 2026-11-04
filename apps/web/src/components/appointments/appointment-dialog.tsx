"use client";

import { isIsoDate } from "@marktwerk/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import {
  archiveAppointmentAction,
  createAppointmentAction,
  loadTerminFormAction,
  restoreAppointmentAction,
  type TerminResult,
  updateAppointmentAction,
} from "@/app/(app)/termin-actions";
import { SELECT_CLASS } from "@/components/settings/select-class";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, OptionalMark } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

type FormData = Awaited<ReturnType<typeof loadTerminFormAction>>;
type ContactOption = FormData["contacts"][number];
type Field =
  | "title"
  | "date"
  | "start"
  | "end"
  | "location"
  | "contact"
  | "contactName"
  | "contactPhone"
  | "contactEmail";
type ContactMode =
  | { mode: "none" }
  | { mode: "saved"; id: string; name: string; detail: string }
  | { mode: "new" };

const OWN_ADDRESS = "__own__";

/**
 * "Termin anlegen / bearbeiten". Lives in the app layout and opens on `?neu=termin` (create; `datum=` pre-fills
 * the day) or `?neu=termin&bearbeiten=<id>` (edit), on any page. Closing removes these parameters again. The
 * pickers and the Termin to edit are loaded when it opens, so no page pays for them. Creating shows an undo
 * toast (undo archives the Termin).
 */
export function AppointmentDialog() {
  const t = useTranslations("appointments");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = params.get("neu") === "termin";
  const editId = params.get("bearbeiten");
  const day = params.get("datum");
  const [data, setData] = useState<FormData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new request (or another Termin) reloads
  useEffect(() => {
    if (!requested) {
      setData(null);
      setLoadFailed(false);
      return;
    }
    let current = true;
    setData(null);
    setLoadFailed(false);
    loadTerminFormAction(editId)
      .then((loaded) => current && setData(loaded))
      .catch(() => current && setLoadFailed(true));
    return () => {
      current = false;
    };
  }, [requested, editId]);

  function close() {
    const rest = new URLSearchParams(params);
    for (const key of ["neu", "bearbeiten", "datum"]) rest.delete(key);
    const query = rest.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }

  const editing = editId !== null;
  return (
    <Modal
      open={requested}
      onOpenChange={(next) => !next && !busy && close()}
      title={editing ? t("editTitle") : t("title")}
      description={t("description")}
      closeLabel={t("cancel")}
      className="w-[min(560px,calc(100%-2rem))]"
    >
      {data ? (
        <AppointmentForm
          notFound={editing && data.appointment === null}
          key={`${editId ?? "new"}|${day ?? ""}`}
          data={data}
          editId={editId}
          day={day && isIsoDate(day) ? day : null}
          onBusy={setBusy}
          onDone={close}
          onCancel={close}
        />
      ) : (
        <p role={loadFailed ? "alert" : "status"} className="text-muted-foreground text-small">
          {loadFailed ? t("errors.loadFailed") : t("loading")}
        </p>
      )}
    </Modal>
  );
}

function AppointmentForm({
  data,
  editId,
  notFound,
  day,
  onBusy,
  onDone,
  onCancel,
}: {
  data: FormData;
  editId: string | null;
  notFound: boolean;
  day: string | null;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("appointments");
  const tKind = useTranslations("appointments.contactKind");
  const { showToast } = useShell();
  const uid = useId();
  const existing = data.appointment;
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.onDate ?? day ?? data.today);
  const [allDay, setAllDay] = useState(existing ? existing.startsAt === null : true);
  const [start, setStart] = useState(existing?.startsAt ?? "");
  const [end, setEnd] = useState(existing?.endsAt ?? "");
  const [venueId, setVenueId] = useState(existing?.venueId ?? "");
  const [ownAddress, setOwnAddress] = useState(existing?.locationText != null);
  const [locationText, setLocationText] = useState(existing?.locationText ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [contact, setContact] = useState<ContactMode>(() => {
    const c = existing?.contact;
    if (!c) return { mode: "none" };
    const detail = [c.phone, c.email].filter(Boolean).join(" · ");
    // A typed contact is edited as a typed one (nothing was saved as a contact).
    return c.id ? { mode: "saved", id: c.id, name: c.name, detail } : { mode: "new" };
  });
  const [contactName, setContactName] = useState(
    existing?.contact && !existing.contact.id ? existing.contact.name : "",
  );
  const [contactPhone, setContactPhone] = useState(
    existing?.contact && !existing.contact.id ? (existing.contact.phone ?? "") : "",
  );
  const [contactEmail, setContactEmail] = useState(
    existing?.contact && !existing.contact.id ? (existing.contact.email ?? "") : "",
  );
  const [saveContact, setSaveContact] = useState(!existing?.contact || !!existing.contact.id);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<{ code: string; field?: Field } | null>(
    notFound ? { code: "not_found" } : null,
  );

  const refs = {
    title: useRef<HTMLInputElement>(null),
    date: useRef<HTMLInputElement>(null),
    start: useRef<HTMLInputElement>(null),
    end: useRef<HTMLInputElement>(null),
    location: useRef<HTMLElement>(null),
    contact: useRef<HTMLInputElement>(null),
    contactName: useRef<HTMLInputElement>(null),
    contactPhone: useRef<HTMLInputElement>(null),
    contactEmail: useRef<HTMLInputElement>(null),
  };
  const [focusField, setFocusField] = useState<Field | null>(null);
  // The buttons are disabled while the server works, which drops the focus: put it on the wrong field after.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the refs are stable
  useEffect(() => {
    if (!focusField || pending) return;
    refs[focusField].current?.focus();
    setFocusField(null);
  }, [focusField, pending]);
  useEffect(() => onBusy(pending), [pending, onBusy]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return data.contacts
      .filter((c) => words.every((w) => c.name.toLowerCase().includes(w)))
      .slice(0, 6);
  }, [data.contacts, query]);

  const errorText = (code: string) =>
    t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.generic");
  const invalid = (field: Field) => error?.field === field || undefined;
  const hint = (field: Field) => (error?.field === field ? `${uid}-error` : undefined);

  /** An action that throws counts as a generic failure, never as a crash into the error boundary. */
  async function guardedCall(run: () => Promise<TerminResult>): Promise<TerminResult> {
    try {
      return await run();
    } catch {
      return { ok: false, error: "generic" };
    }
  }

  function pick(option: ContactOption) {
    setContact({ mode: "saved", id: option.id, name: option.name, detail: tKind(option.kind) });
    setQuery("");
  }

  function submit() {
    setError(null);
    const typed = contact.mode === "new";
    const draft = {
      title,
      onDate: date,
      startsAt: allDay || start === "" ? null : start,
      endsAt: allDay || end === "" ? null : end,
      venueId: ownAddress || venueId === "" ? null : venueId,
      locationText: ownAddress && locationText.trim() !== "" ? locationText : null,
      notes: notes.trim() === "" ? null : notes,
      contactId: contact.mode === "saved" ? contact.id : null,
      contactName: typed ? contactName : null,
      contactPhone: typed ? contactPhone : null,
      contactEmail: typed ? contactEmail : null,
      saveContact: typed && saveContact,
    };
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createAppointmentAction>>;
      try {
        result = editId
          ? await updateAppointmentAction(editId, draft)
          : await createAppointmentAction(draft);
      } catch {
        setError({ code: "generic" });
        return;
      }
      if (!result.ok) {
        setError({ code: result.error, field: result.field as Field | undefined });
        setFocusField((result.field as Field | undefined) ?? null);
        return;
      }
      onDone();
      if (editId) {
        showToast({ message: t("toast.saved") });
        return;
      }
      const { id } = result;
      showToast({
        message: t("toast.created"),
        actionLabel: t("toast.undo"),
        onAction: async () => {
          const undone = await guardedCall(() => archiveAppointmentAction(id));
          showToast(
            undone.ok
              ? {
                  message: t("toast.createdUndone"),
                  actionLabel: t("toast.undo"),
                  onAction: async () => {
                    const restored = await guardedCall(() => restoreAppointmentAction(id));
                    if (!restored.ok)
                      showToast({ message: errorText(restored.error), tone: "error" });
                  },
                }
              : { message: errorText(undone.error), tone: "error" },
          );
        },
      });
    });
  }

  const group = "flex flex-col gap-1.5";
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={group}>
        <Label htmlFor={`${uid}-title`}>{t("name")}</Label>
        <Input
          id={`${uid}-title`}
          ref={refs.title}
          value={title}
          maxLength={200}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={invalid("title")}
          aria-describedby={hint("title")}
          // biome-ignore lint/a11y/noAutofocus: a dialog opened to type into
          autoFocus
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className={`${group} min-w-40 flex-1`}>
          <Label htmlFor={`${uid}-date`}>{t("date")}</Label>
          <Input
            id={`${uid}-date`}
            ref={refs.date}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tabular"
            aria-invalid={invalid("date")}
            aria-describedby={hint("date")}
          />
        </div>
        <label className="flex min-h-(--control-h) cursor-pointer items-center gap-2 font-medium text-small">
          <input
            type="checkbox"
            role="switch"
            aria-checked={allDay}
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="size-4 accent-primary"
          />
          {t("allDay")}
        </label>
      </div>

      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div className={group}>
            <Label htmlFor={`${uid}-start`}>{t("from")}</Label>
            <Input
              id={`${uid}-start`}
              ref={refs.start}
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="tabular"
              aria-invalid={invalid("start")}
              aria-describedby={hint("start")}
            />
          </div>
          <div className={group}>
            <Label htmlFor={`${uid}-end`} optional>
              {t("to")}
            </Label>
            <Input
              id={`${uid}-end`}
              ref={refs.end}
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="tabular"
              aria-invalid={invalid("end")}
              aria-describedby={hint("end")}
            />
          </div>
        </div>
      )}

      <div className={group}>
        <Label htmlFor={`${uid}-where`} optional>
          {ownAddress ? t("whereText") : t("where")}
        </Label>
        {ownAddress ? (
          <>
            <Input
              id={`${uid}-where`}
              ref={(node) => {
                (refs.location as { current: HTMLElement | null }).current = node;
              }}
              value={locationText}
              maxLength={300}
              placeholder={t("whereTextPlaceholder")}
              onChange={(e) => setLocationText(e.target.value)}
              aria-invalid={invalid("location")}
              aria-describedby={hint("location")}
            />
            <button
              type="button"
              className="self-start text-accent-soft-foreground text-small underline-offset-4 hover:underline"
              onClick={() => {
                setOwnAddress(false);
                setLocationText("");
              }}
            >
              {t("whereBack")}
            </button>
          </>
        ) : (
          <select
            id={`${uid}-where`}
            ref={(node) => {
              (refs.location as { current: HTMLElement | null }).current = node;
            }}
            value={venueId}
            className={SELECT_CLASS}
            aria-invalid={invalid("location")}
            aria-describedby={hint("location")}
            onChange={(e) => {
              if (e.target.value === OWN_ADDRESS) {
                setOwnAddress(true);
                setVenueId("");
              } else setVenueId(e.target.value);
            }}
          >
            <option value="">{t("whereNone")}</option>
            {data.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.city ? `, ${v.city}` : ""}
              </option>
            ))}
            <option value={OWN_ADDRESS}>{t("whereOwn")}</option>
          </select>
        )}
      </div>

      <fieldset className={`${group} min-w-0 border-0 p-0`}>
        <legend className="mb-1.5 font-medium text-small">
          {t("contact")} <OptionalMark />
        </legend>
        {contact.mode === "saved" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{contact.name}</p>
              {contact.detail && (
                <p className="truncate text-muted-foreground text-small">{contact.detail}</p>
              )}
            </div>
            <Button size="sm" onClick={() => setContact({ mode: "none" })}>
              {t("contactChange")}
            </Button>
          </div>
        )}
        {contact.mode === "none" && (
          <>
            <Input
              ref={refs.contact}
              role="searchbox"
              aria-label={t("contactSearch")}
              placeholder={t("contactSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-invalid={invalid("contact")}
              aria-describedby={hint("contact")}
            />
            <ul className="flex flex-col rounded-lg border">
              {matches.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 px-3 py-1 text-left hover:bg-hover"
                    onClick={() => pick(option)}
                  >
                    <span className="truncate">{option.name}</span>
                    <span className="shrink-0 text-muted-foreground text-tiny">
                      {tKind(option.kind)}
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && query.trim() !== "" && (
                <li className="px-3 py-2 text-muted-foreground text-small">{t("contactNone")}</li>
              )}
              <li className="border-border-subtle border-t first:border-t-0">
                <button
                  type="button"
                  className="flex min-h-9 w-full cursor-pointer items-center px-3 py-1 text-left font-medium text-accent-soft-foreground hover:bg-hover"
                  onClick={() => {
                    setContact({ mode: "new" });
                    setContactName(query.trim());
                    setQuery("");
                  }}
                >
                  {t("contactNew")}
                </button>
              </li>
            </ul>
          </>
        )}
        {contact.mode === "new" && (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className={group}>
              <Label htmlFor={`${uid}-cname`}>{t("contactName")}</Label>
              <Input
                id={`${uid}-cname`}
                ref={refs.contactName}
                value={contactName}
                maxLength={200}
                onChange={(e) => setContactName(e.target.value)}
                aria-invalid={invalid("contactName")}
                aria-describedby={hint("contactName")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <div className={group}>
                <Label htmlFor={`${uid}-cphone`} optional>
                  {t("contactPhone")}
                </Label>
                <Input
                  id={`${uid}-cphone`}
                  ref={refs.contactPhone}
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  aria-invalid={invalid("contactPhone")}
                  aria-describedby={hint("contactPhone")}
                />
              </div>
              <div className={group}>
                <Label htmlFor={`${uid}-cmail`} optional>
                  {t("contactEmail")}
                </Label>
                <Input
                  id={`${uid}-cmail`}
                  ref={refs.contactEmail}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  aria-invalid={invalid("contactEmail")}
                  aria-describedby={hint("contactEmail")}
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={saveContact}
                onChange={(e) => setSaveContact(e.target.checked)}
                className="size-4 accent-primary"
              />
              {t("saveContact")}
            </label>
            <button
              type="button"
              className="self-start text-accent-soft-foreground text-small underline-offset-4 hover:underline"
              onClick={() => {
                setContact({ mode: "none" });
                setContactName("");
                setContactPhone("");
                setContactEmail("");
              }}
            >
              {t("contactBack")}
            </button>
          </div>
        )}
      </fieldset>

      <div className={group}>
        <Label htmlFor={`${uid}-notes`} optional>
          {t("notes")}
        </Label>
        <textarea
          id={`${uid}-notes`}
          value={notes}
          rows={3}
          maxLength={2000}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1"
        />
      </div>

      {error && (
        <p id={`${uid}-error`} role="alert" className="text-small text-status-critical">
          {errorText(error.code)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" variant="default" aria-busy={pending} disabled={pending || notFound}>
          {editId ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
