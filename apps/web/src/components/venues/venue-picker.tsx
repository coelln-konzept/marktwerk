"use client";

import { useMemo, useState } from "react";
import { RecordPicker } from "@/components/ui/record-picker";
import { type CreatedVenue, VenueQuickCreate } from "./venue-quick-create";

type VenueOption = { id: string; name: string; city: string | null };

/**
 * Picking an Ort wherever a form needs one (user test 2, UT2-01/07): search by name or city; with `canCreate`
 * (venue:write) the last row "+ Neu: …" opens the Ort quick form on top, and the new Ort is selected.
 */
export function VenuePicker({
  id,
  venues,
  value,
  onChange,
  canCreate = false,
  placeholder,
  invalid,
  describedBy,
}: {
  id: string;
  venues: readonly VenueOption[];
  value: string | null;
  onChange: (id: string) => void;
  canCreate?: boolean;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [created, setCreated] = useState<CreatedVenue[]>([]);
  const [newText, setNewText] = useState<string | null>(null);
  const options = useMemo(
    () =>
      [...venues, ...created.filter((c) => !venues.some((v) => v.id === c.id))].map((v) => ({
        id: v.id,
        label: v.name,
        hint: v.city,
      })),
    [venues, created],
  );
  return (
    <>
      <RecordPicker
        id={id}
        options={options}
        value={value || null}
        onChange={(next) => next && onChange(next)}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onCreate={canCreate ? (text) => setNewText(text) : undefined}
      />
      {canCreate && (
        <VenueQuickCreate
          open={newText !== null}
          onOpenChange={(open) => !open && setNewText(null)}
          text={newText ?? ""}
          onCreated={(venue) => {
            setCreated((prev) => [...prev, venue]);
            onChange(venue.id);
          }}
        />
      )}
    </>
  );
}
