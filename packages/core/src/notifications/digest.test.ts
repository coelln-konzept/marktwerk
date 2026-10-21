import { describe, expect, it } from "vitest";
import { type DigestItem, digestUrgency, renderDigest, renderImmediate } from "./digest";

describe("digestUrgency", () => {
  it("splits overdue, today and the coming week; later is not in the digest", () => {
    expect(digestUrgency("2026-10-20", "2026-10-21")).toBe("overdue");
    expect(digestUrgency("2026-10-21", "2026-10-21")).toBe("today");
    expect(digestUrgency("2026-10-28", "2026-10-21")).toBe("soon");
    expect(digestUrgency("2026-10-29", "2026-10-21")).toBeNull();
  });
});

const items: DigestItem[] = [
  {
    kind: "task",
    title: "Halteverbot aufstellen",
    dueOn: "2026-10-23",
    urgency: "soon",
    href: "/board?detail=task:1",
    context: "Flohmarkt Altstadt",
  },
  {
    kind: "permit",
    title: "Wasser 2027",
    dueOn: "2026-10-18",
    urgency: "overdue",
    href: "/logbuch?genehmigung=2",
  },
  {
    kind: "task",
    title: "Plakate bestellen",
    dueOn: "2026-10-21",
    urgency: "today",
    href: "/board?detail=task:3",
  },
];

describe("renderDigest", () => {
  it("renders nothing without items", () => {
    expect(
      renderDigest({ firstName: "Anna", today: "2026-10-21", items: [], baseUrl: "http://x" }),
    ).toBeNull();
  });

  it("groups by urgency with absolute links and a counting subject", () => {
    const mail = renderDigest({
      firstName: "Anna",
      today: "2026-10-21",
      items,
      baseUrl: "https://marktwerk.example/",
    });
    expect(mail?.subject).toBe(
      "marktwerk · 21.10.2026: 1 überfällig, 1 heute fällig, 1 diese Woche",
    );
    const text = mail?.text ?? "";
    expect(text.startsWith("Guten Morgen Anna,")).toBe(true);
    expect(text.indexOf("Überfällig (1)")).toBeLessThan(text.indexOf("Heute fällig (1)"));
    expect(text.indexOf("Heute fällig (1)")).toBeLessThan(text.indexOf("Diese Woche (1)"));
    expect(text).toContain("- Genehmigung: Wasser 2027 (fällig 18.10.2026)");
    expect(text).toContain(
      "- Aufgabe: Halteverbot aufstellen · Flohmarkt Altstadt (fällig 23.10.2026)",
    );
    expect(text).toContain("https://marktwerk.example/logbuch?genehmigung=2");
  });
});

describe("renderImmediate", () => {
  it("has title, body and an absolute link", () => {
    const mail = renderImmediate({
      title: "Eskaliert: Wasser 2027",
      body: "Seit 3 Tagen überfällig",
      link: "/logbuch?genehmigung=2",
      baseUrl: "http://localhost:3000",
    });
    expect(mail.subject).toBe("marktwerk · Eskaliert: Wasser 2027");
    expect(mail.text).toBe(
      "Eskaliert: Wasser 2027\n\nSeit 3 Tagen überfällig\n\nhttp://localhost:3000/logbuch?genehmigung=2",
    );
  });
});
