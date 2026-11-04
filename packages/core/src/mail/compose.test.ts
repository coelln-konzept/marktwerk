import { describe, expect, it } from "vitest";
import { assembleOutgoing, buildQuote, eventBlock, fillVariables, htmlToText } from "./compose";

describe("fillVariables", () => {
  it("replaces filled variables and escapes values", () => {
    const r = fillVariables('<p>Guten Tag <span data-variable="Vorname"></span>,</p>', {
      Vorname: "Petra <3",
    });
    expect(r).toEqual({ html: "<p>Guten Tag Petra &lt;3,</p>", missing: [] });
  });
  it("reports empty and unknown variables and keeps them", () => {
    const r = fillVariables(
      '<span data-variable="Stand"></span> <span data-variable="Gibtsnicht" class="mail-var">[x]</span>',
      { Stand: "" },
    );
    expect(r.missing).toEqual(["Stand", "Gibtsnicht"]);
  });
});

describe("buildQuote", () => {
  it("quotes with a German header in Berlin time", () => {
    const q = buildQuote({
      fromName: "Petra Schmitz",
      at: "2026-11-02T08:12:00Z",
      html: "<p>Hallo</p>",
    });
    expect(q).toContain("Am Mo., 02.11.2026 um 09:12 schrieb Petra Schmitz:");
    expect(q).toContain("<blockquote><p>Hallo</p></blockquote>");
  });
});

describe("eventBlock / assembleOutgoing / htmlToText", () => {
  it("builds the event block from event data", () => {
    const b = eventBlock({
      name: "Flohmarkt Neuss",
      startsOn: "2027-04-11",
      venueName: "Neuss – Markt",
      setup: "07:00",
      open: "11:00",
      close: "18:00",
      pricePerMCents: 1500,
    });
    const text = htmlToText(b);
    expect(text).toContain("Flohmarkt Neuss");
    expect(text).toContain("So., 11.04.2027 (KW 14)");
    expect(text).toContain("Marktzeit 11:00–18:00 Uhr");
    expect(text).toMatch(/15,00\s€ pro Meter/);
  });
  it("puts body, event block, signature and quote in order", () => {
    const out = assembleOutgoing({
      bodyHtml: "<p>Text</p>",
      eventBlockHtml: "<p>EVENT</p>",
      signatureHtml: "<p>SIG</p>",
      quoteHtml: "<blockquote>Q</blockquote>",
    });
    expect(out.text.indexOf("Text")).toBeLessThan(out.text.indexOf("EVENT"));
    expect(out.text.indexOf("EVENT")).toBeLessThan(out.text.indexOf("SIG"));
    expect(out.text.indexOf("SIG")).toBeLessThan(out.text.indexOf("Q"));
  });
  it("turns lists and paragraphs into readable text", () => {
    expect(htmlToText("<p>A</p><ul><li>x</li><li>y</li></ul><p>B&amp;C</p>")).toBe(
      "A\n\n• x\n• y\n\nB&C",
    );
  });
});
