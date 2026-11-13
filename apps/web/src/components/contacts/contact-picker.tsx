"use client";

import { useMemo, useState } from "react";
import {
  CONTACT_KINDS,
  type ContactKindKey,
  ContactQuickCreate,
  type CreatedContact,
} from "@/components/contacts/contact-quick-create";
import { RecordPicker, type RecordPickerOption } from "@/components/ui/record-picker";

/**
 * Searchable contact picker with "+ Neu" (UT2-07): a `RecordPicker` plus the stacked
 * `ContactQuickCreate`. A contact created here joins the options right away (until the refreshed page
 * data has it) and is selected. `canCreate` comes from the server (`contact:write`); without it the
 * picker only picks. `kinds` limits the kinds offered when creating, the first one is preselected; pass a
 * module-level constant, a new array on every render would reset the open dialog.
 */
export function ContactPicker({
  options,
  value,
  onChange,
  kinds = CONTACT_KINDS,
  canCreate,
  allowNone = false,
  noneLabel,
  placeholder,
  id,
  name,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  options: readonly RecordPickerOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  kinds?: readonly ContactKindKey[];
  canCreate: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  /** Goes on the text input, so `<Label htmlFor>` and focusing on errors work. */
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [created, setCreated] = useState<CreatedContact[]>([]);
  const [newName, setNewName] = useState<string | null>(null);
  const merged = useMemo(
    () => [...options, ...created.filter((c) => !options.some((o) => o.id === c.id))],
    [options, created],
  );

  return (
    <>
      <RecordPicker
        id={id}
        name={name}
        options={merged}
        value={value}
        onChange={onChange}
        allowNone={allowNone}
        noneLabel={noneLabel}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onCreate={canCreate ? (text) => setNewName(text) : undefined}
      />
      {canCreate && (
        <ContactQuickCreate
          open={newName !== null}
          onOpenChange={(open) => !open && setNewName(null)}
          name={newName ?? ""}
          kinds={kinds}
          onCreated={(contact) => {
            setCreated((prev) => [...prev, contact]);
            onChange(contact.id);
          }}
        />
      )}
    </>
  );
}
