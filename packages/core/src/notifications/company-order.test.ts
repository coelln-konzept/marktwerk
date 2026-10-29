import { describe, expect, it } from "vitest";
import {
  type CenterOrderInput,
  centerUrgency,
  compareCenterOrder,
  isSupersededNotification,
  latestPerSubject,
} from "./company-order";

const TODAY = "2026-10-29";
const item = (patch: Partial<CenterOrderInput> = {}): CenterOrderInput => ({
  subjectType: "task",
  dueOn: TODAY,
  isKey: false,
  title: "Aufgabe",
  marketStartsOn: null,
  createdAt: "2026-10-28T08:00:00.000Z",
  ...patch,
});
const order = (items: CenterOrderInput[]) =>
  [...items].sort((a, b) => compareCenterOrder(a, b, TODAY)).map((i) => i.title);

describe("centerUrgency", () => {
  it("uses the Übersicht's 7-day horizon", () => {
    expect(centerUrgency("2026-10-28", TODAY)).toBe("overdue");
    expect(centerUrgency(TODAY, TODAY)).toBe("today");
    expect(centerUrgency("2026-11-05", TODAY)).toBe("soon");
    expect(centerUrgency("2026-11-06", TODAY)).toBe("upcoming");
    expect(centerUrgency(null, TODAY)).toBe("upcoming");
  });
});

describe("compareCenterOrder", () => {
  it("puts overdue before today before later, whatever the kind", () => {
    expect(
      order([
        item({ title: "Später", dueOn: "2026-11-10", subjectType: "permit" }),
        item({ title: "Heute", dueOn: TODAY, isKey: true }),
        item({ title: "Überfällig", dueOn: "2026-10-20" }),
      ]),
    ).toEqual(["Überfällig", "Heute", "Später"]);
  });

  it("puts Kernaufgaben first, then the soonest market (the Übersicht order)", () => {
    expect(
      order([
        item({ title: "Antikmarkt März", dueOn: "2026-10-01", marketStartsOn: "2027-03-21" }),
        item({ title: "Flohmarkt Samstag", dueOn: "2026-10-27", marketStartsOn: "2026-10-31" }),
        item({
          title: "Kern, später Markt",
          dueOn: "2026-10-27",
          isKey: true,
          marketStartsOn: "2027-03-21",
        }),
      ]),
    ).toEqual(["Kern, später Markt", "Flohmarkt Samstag", "Antikmarkt März"]);
  });

  it("then permits before tasks, the oldest date, and the newest notification", () => {
    const sorted = [
      item({ title: "Aufgabe", dueOn: TODAY, createdAt: "2026-10-28T08:00:00.000Z" }),
      item({ title: "Antrag", dueOn: TODAY, subjectType: "permit" }),
      item({ title: "Aufgabe", dueOn: TODAY, createdAt: "2026-10-29T06:00:00.000Z" }),
    ].sort((a, b) => compareCenterOrder(a, b, TODAY));
    expect(sorted.map((i) => i.title)).toEqual(["Antrag", "Aufgabe", "Aufgabe"]);
    expect(sorted[1]?.createdAt).toBe("2026-10-29T06:00:00.000Z");
  });
});

describe("isSupersededNotification", () => {
  const base = { subjectActive: true, keyCurrent: true, storedDone: true, newerSibling: false };

  it("is true for a rotated notification of a task that is still open", () => {
    expect(isSupersededNotification({ ...base, newerSibling: true })).toBe(true);
  });

  it("is true when the date moved and the subject is still open", () => {
    expect(isSupersededNotification({ ...base, keyCurrent: false })).toBe(true);
    expect(isSupersededNotification({ ...base, keyCurrent: false, storedDone: false })).toBe(true);
  });

  it("is false for a notification a person closed (no newer one, same date)", () => {
    expect(isSupersededNotification(base)).toBe(false);
  });

  it("is false when the subject is resolved (a real Erledigt)", () => {
    expect(isSupersededNotification({ ...base, subjectActive: false, newerSibling: true })).toBe(
      false,
    );
    expect(isSupersededNotification({ ...base, subjectActive: false, keyCurrent: false })).toBe(
      false,
    );
  });

  it("is false for the open notification that replaced it", () => {
    expect(isSupersededNotification({ ...base, storedDone: false })).toBe(false);
  });
});

describe("latestPerSubject", () => {
  it("keeps the newest notification of each subject, in the given order", () => {
    const rows = [
      { id: "a1", subjectId: "a", createdAt: "2026-10-27T08:00:00.000Z" },
      { id: "b1", subjectId: "b", createdAt: "2026-10-26T08:00:00.000Z" },
      { id: "a2", subjectId: "a", createdAt: "2026-10-28T08:00:00.000Z" },
    ];
    expect(latestPerSubject(rows).map((r) => r.id)).toEqual(["b1", "a2"]);
  });
});
