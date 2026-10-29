import { describe, expect, it } from "vitest";
import {
  deadlineKind,
  deadlineText,
  GROUP_MIN,
  groupDeadlines,
} from "@/components/kalender/group-deadlines";
import { DEFAULT_LAYERS, layersChangedCount } from "@/components/kalender/layers";
import type { CalendarItem } from "@/server/queries/due";

/** Pure Kalender helpers: same-day summaries, object-first texts, the "N geändert" count. */

const permit = (n: number, kind: string, date = "2026-12-07", tone?: CalendarItem["tone"]) =>
  ({
    layer: "permits",
    id: `p${n}:${kind}`,
    date,
    title: `Entscheidung erwartet: Halteverbot – 2027-03-13 · Leverkusen`,
    href: `/genehmigungen?genehmigung=p${n}`,
    tone: tone ?? "neutral",
  }) satisfies CalendarItem;

describe("groupDeadlines", () => {
  it("collapses 70 same-day decisions into one summary linking to Genehmigungen", () => {
    const items = Array.from({ length: 70 }, (_, i) => permit(i, "decision"));
    const out = groupDeadlines(items);
    expect(out).toHaveLength(1);
    expect(out[0]?.group).toEqual({ count: 70, kind: "decision" });
    expect(out[0]?.href).toBe("/genehmigungen");
  });

  it("keeps small days, other days and other kinds apart", () => {
    const items = [
      ...Array.from({ length: GROUP_MIN - 1 }, (_, i) => permit(i, "decision")),
      ...Array.from({ length: GROUP_MIN }, (_, i) => permit(10 + i, "apply", "2026-12-08")),
    ];
    const out = groupDeadlines(items);
    expect(out.filter((i) => i.group)).toHaveLength(1);
    expect(out.filter((i) => !i.group)).toHaveLength(GROUP_MIN - 1);
  });

  it("never hides an overdue item inside a calm summary", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => permit(i, "apply", "2026-12-07", "neutral")),
      permit(99, "apply", "2026-12-07", "critical"),
    ];
    const out = groupDeadlines(items);
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.tone === "critical")?.group).toBeUndefined();
  });

  it("leaves layers without a target page alone", () => {
    const items = Array.from(
      { length: 6 },
      (_, i): CalendarItem => ({
        layer: "installments",
        id: `i${i}`,
        date: "2026-12-07",
        title: "Rate",
        href: "/x",
      }),
    );
    expect(groupDeadlines(items)).toHaveLength(6);
  });
});

describe("deadlineText", () => {
  it("puts the venue first, drops the verb and writes dates the German way", () => {
    const item = permit(1, "decision");
    expect(deadlineKind(item)).toBe("decision");
    expect(deadlineText(item)).toBe("Leverkusen · Halteverbot – 13.03.2027");
  });
});

describe("layersChangedCount", () => {
  it("is 0 for the default and counts every switched layer and narrowing", () => {
    expect(layersChangedCount(DEFAULT_LAYERS)).toBe(0);
    expect(
      layersChangedCount({
        ...DEFAULT_LAYERS,
        types: ["flea"],
        holidays: false,
        critical: true,
      }),
    ).toBe(3 + 1 + 1);
  });

  it("ignores module layers the person cannot see", () => {
    expect(
      layersChangedCount({ ...DEFAULT_LAYERS, deadlines: ["permits"] }, ["permits", "shifts"]),
    ).toBe(1);
  });
});
