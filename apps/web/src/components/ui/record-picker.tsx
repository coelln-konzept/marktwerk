"use client";

import { Combobox } from "@base-ui/react/combobox";
import { filterPickerOptions, pickerQuery } from "@marktwerk/core/text/picker";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type RecordPickerOption = {
  id: string;
  label: string;
  /** Second, quieter line (e.g. the city); also searched. */
  hint?: string | null;
};

/** One row of the list: a record, "no record" or "+ Neu". */
type Entry =
  | { kind: "option"; value: string; label: string; hint?: string | null }
  | { kind: "none"; value: string; label: string }
  | { kind: "create"; value: string; label: string };

const NONE_VALUE = "\u0000none";
const CREATE_VALUE = "\u0000create";

/** Same box as `Input` / `SELECT_CLASS`, with room for the chevron. */
const inputClass =
  "flex min-h-(--control-h) w-full min-w-0 rounded-lg border border-input bg-card py-1 pr-9 pl-3 text-foreground placeholder:text-faint-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]";
const itemClass =
  "flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 text-small outline-hidden data-[highlighted]:bg-hover";

/**
 * Searchable combobox for picking one record (Ort, contact …), UT2-07 / D2-9. Type to filter (every word,
 * case and umlauts ignored), arrows to move, Enter to pick, Esc to close and drop the typed text, Tab to
 * leave. With `onCreate` the last row is "+ Neu: ‹typed text›"; picking it hands the text over (the
 * caller opens a `QuickCreateDialog`, then merges the new record into `options` and selects it).
 * A hidden input carries the id, so the picker also works in plain forms (`name`).
 */
export function RecordPicker({
  options,
  value,
  onChange,
  placeholder,
  allowNone = false,
  noneLabel,
  onCreate,
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
  placeholder?: string;
  /** Adds a first row that clears the choice (`noneLabel`); Esc on the closed picker clears it too. */
  allowNone?: boolean;
  noneLabel?: string;
  /** When set, the last row creates a record from the typed text. */
  onCreate?: (text: string) => void;
  /** Goes on the text input, so `<Label htmlFor>` and focusing on errors work. */
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const t = useTranslations("picker");

  const optionEntries = useMemo<Entry[]>(
    () => options.map((o) => ({ kind: "option", value: o.id, label: o.label, hint: o.hint })),
    [options],
  );
  const selected = useMemo(
    () => optionEntries.find((e) => e.value === value) ?? null,
    [optionEntries, value],
  );
  const selectedLabel = selected?.label ?? "";

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(selectedLabel);
  // The selection changed from outside (or a new record was picked): show its label.
  const [shownLabel, setShownLabel] = useState(selectedLabel);
  if (shownLabel !== selectedLabel) {
    setShownLabel(selectedLabel);
    setInputValue(selectedLabel);
  }

  const query = pickerQuery(inputValue, selected ? selectedLabel : null);
  const canCreate = onCreate !== undefined;
  const createLabel = query === "" ? t("createEmpty") : t("create", { text: query });
  // Stable arrays: base-ui keys its list state on the identity of `items` and `filteredItems`.
  const { items, filteredItems } = useMemo(() => {
    const none: Entry[] =
      allowNone && noneLabel ? [{ kind: "none", value: NONE_VALUE, label: noneLabel }] : [];
    const create: Entry[] = canCreate
      ? [{ kind: "create", value: CREATE_VALUE, label: createLabel }]
      : [];
    return {
      items: [...none, ...optionEntries, ...create],
      filteredItems: [
        ...(query === "" ? none : []),
        ...filterPickerOptions(optionEntries, query),
        ...create,
      ],
    };
  }, [allowNone, noneLabel, canCreate, createLabel, optionEntries, query]);

  /** Closes the list and puts the selected label back in the input. */
  function close() {
    setOpen(false);
    setInputValue(selectedLabel);
  }

  return (
    <>
      <Combobox.Root<Entry>
        items={items}
        filteredItems={filteredItems}
        value={selected}
        isItemEqualToValue={(a, b) => a.value === b.value}
        itemToStringLabel={(e) => (e.kind === "option" ? e.label : "")}
        itemToStringValue={(e) => (e.kind === "option" ? e.value : "")}
        inputValue={inputValue}
        onInputValueChange={(next) => setInputValue(next)}
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        onValueChange={(next, details) => {
          if (next?.kind === "create") {
            // Not a selection: keep the current value and hand the typed text to the caller.
            details.cancel();
            close();
            onCreate?.(query);
            return;
          }
          if (next === null && !allowNone) {
            details.cancel();
            return;
          }
          onChange(next?.kind === "option" ? next.value : null);
        }}
        autoHighlight
        disabled={disabled}
      >
        <Combobox.InputGroup className={cn("relative min-w-0", className)}>
          <Combobox.Input
            id={id}
            placeholder={placeholder}
            aria-invalid={ariaInvalid || undefined}
            aria-describedby={ariaDescribedBy}
            autoComplete="off"
            className={inputClass}
            onKeyDown={(event) => {
              // Esc on the closed picker clears the choice in base-ui; without "none" let it reach the
              // surrounding dialog instead.
              if (event.key === "Escape" && !open && (!allowNone || value === null))
                event.preventBaseUIHandler();
            }}
          />
          <Combobox.Trigger
            aria-label={t("open")}
            className="-translate-y-1/2 absolute top-1/2 right-1 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-hover disabled:cursor-not-allowed"
          >
            <ChevronDown aria-hidden className="size-4" />
          </Combobox.Trigger>
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 outline-hidden">
            <Combobox.Popup className="w-(--anchor-width) min-w-[220px] max-w-(--available-width) rounded-[10px] border bg-popover p-1 text-popover-foreground shadow-pop outline-hidden">
              <Combobox.Empty className="px-2 py-1.5 text-muted-foreground text-small empty:p-0">
                {t("empty")}
              </Combobox.Empty>
              <Combobox.List className="max-h-[min(320px,var(--available-height))] overflow-y-auto overscroll-contain outline-hidden data-empty:hidden">
                {(entry: Entry) => (
                  <Combobox.Item
                    key={entry.value}
                    value={entry}
                    className={cn(
                      itemClass,
                      entry.kind === "none" && "text-muted-foreground",
                      entry.kind === "create" && "font-medium text-accent-soft-foreground",
                    )}
                  >
                    {entry.kind === "create" ? (
                      <Plus aria-hidden className="size-4 shrink-0" />
                    ) : (
                      <span className="grid size-4 shrink-0 place-items-center">
                        <Combobox.ItemIndicator>
                          <Check aria-hidden className="size-4" />
                        </Combobox.ItemIndicator>
                      </span>
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{entry.label}</span>
                      {entry.kind === "option" && entry.hint && (
                        <span className="truncate text-muted-foreground text-tiny">
                          {entry.hint}
                        </span>
                      )}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </>
  );
}
