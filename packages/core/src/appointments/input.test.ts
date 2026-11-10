import { describe, expect, it } from "vitest";
import { type AppointmentDraft, checkAppointment } from "./input";

const draft = (patch: Partial<AppointmentDraft> = {}): AppointmentDraft => ({
  title: "Besichtigung",
  onDate: "2026-11-20",
  startsAt: null,
  endsAt: null,
  venueId: null,
  locationText: null,
  notes: null,
  contactId: null,
  contactName: null,
  contactPhone: null,
  contactEmail: null,
  saveContact: false,
  ...patch,
});

describe("checkAppointment", () => {
  it("accepts an all-day appointment", () => {
    expect(checkAppointment(draft())).toBeNull();
  });

  it("accepts a timed appointment", () => {
    expect(checkAppointment(draft({ startsAt: "09:00", endsAt: "10:30" }))).toBeNull();
    expect(checkAppointment(draft({ startsAt: "09:00" }))).toBeNull();
  });

  it("requires a title", () => {
    expect(checkAppointment(draft({ title: "   " }))).toBe("title_required");
  });

  it("requires a real date", () => {
    expect(checkAppointment(draft({ onDate: "2026-02-30" }))).toBe("date_invalid");
    expect(checkAppointment(draft({ onDate: "" }))).toBe("date_invalid");
  });

  it("rejects unreadable times", () => {
    expect(checkAppointment(draft({ startsAt: "25:00" }))).toBe("time_invalid");
    expect(checkAppointment(draft({ startsAt: "09:00", endsAt: "abc" }))).toBe("time_invalid");
  });

  it("treats blank times as not set", () => {
    expect(checkAppointment(draft({ startsAt: " ", endsAt: "" }))).toBeNull();
  });

  it("needs a start when there is an end", () => {
    expect(checkAppointment(draft({ endsAt: "10:00" }))).toBe("end_without_start");
  });

  it("rejects an end that is not after the start", () => {
    expect(checkAppointment(draft({ startsAt: "10:00", endsAt: "09:00" }))).toBe(
      "end_before_start",
    );
    expect(checkAppointment(draft({ startsAt: "10:00", endsAt: "10:00" }))).toBe(
      "end_before_start",
    );
  });

  it("accepts the edges of the day", () => {
    expect(checkAppointment(draft({ startsAt: "00:00", endsAt: "00:30" }))).toBeNull();
    expect(checkAppointment(draft({ startsAt: "23:00", endsAt: "23:59" }))).toBeNull();
  });

  it("has no overnight appointments", () => {
    expect(checkAppointment(draft({ startsAt: "23:00", endsAt: "00:00" }))).toBe(
      "end_before_start",
    );
  });

  it("allows a venue or a text, not both", () => {
    expect(checkAppointment(draft({ venueId: "v1" }))).toBeNull();
    expect(checkAppointment(draft({ locationText: "Rathaus" }))).toBeNull();
    expect(checkAppointment(draft({ venueId: "v1", locationText: "Rathaus" }))).toBe(
      "two_locations",
    );
    expect(checkAppointment(draft({ venueId: "v1", locationText: "  " }))).toBeNull();
  });

  it("needs a name for a typed contact", () => {
    expect(checkAppointment(draft({ contactPhone: "0221 123" }))).toBe("contact_name_required");
    expect(checkAppointment(draft({ contactEmail: "a@b.de" }))).toBe("contact_name_required");
    expect(
      checkAppointment(draft({ contactName: "Frau Meier", contactPhone: "0221 123" })),
    ).toBeNull();
    expect(checkAppointment(draft({ contactName: "Frau Meier" }))).toBeNull();
  });

  it("caps the text lengths (at the limit is fine, one over is not)", () => {
    const n = (len: number) => "x".repeat(len);
    expect(checkAppointment(draft({ title: n(200) }))).toBeNull();
    expect(checkAppointment(draft({ title: n(201) }))).toBe("title_too_long");
    expect(checkAppointment(draft({ locationText: n(300) }))).toBeNull();
    expect(checkAppointment(draft({ locationText: n(301) }))).toBe("location_too_long");
    expect(checkAppointment(draft({ notes: n(2000) }))).toBeNull();
    expect(checkAppointment(draft({ notes: n(2001) }))).toBe("notes_too_long");
    expect(checkAppointment(draft({ contactName: n(200) }))).toBeNull();
    expect(checkAppointment(draft({ contactName: n(201) }))).toBe("contact_too_long");
    expect(checkAppointment(draft({ contactName: "A", contactPhone: n(41) }))).toBe(
      "contact_too_long",
    );
    expect(checkAppointment(draft({ contactName: "A", contactEmail: `${n(250)}@b.de` }))).toBe(
      "contact_too_long",
    );
    // surrounding blanks do not count, and a saved contact ignores the typed fields
    expect(checkAppointment(draft({ title: `  ${n(200)}  ` }))).toBeNull();
    expect(checkAppointment(draft({ contactId: "c1", contactName: n(500) }))).toBeNull();
  });

  it("checks the typed e-mail address", () => {
    expect(checkAppointment(draft({ contactName: "Meier", contactEmail: "a@b" }))).toBe(
      "email_invalid",
    );
    expect(checkAppointment(draft({ contactName: "Meier", contactEmail: "a@b.de" }))).toBeNull();
  });

  it("ignores the inline contact fields when a saved contact is chosen", () => {
    expect(
      checkAppointment(
        draft({ contactId: "c1", contactPhone: "123", contactEmail: "kaputt", contactName: null }),
      ),
    ).toBeNull();
  });
});
