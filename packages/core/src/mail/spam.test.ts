import { describe, expect, it } from "vitest";
import { spamCheck } from "./spam";

const mail = (over: Partial<Parameters<typeof spamCheck>[0]>) => ({
  fromAddress: "petra@example.com",
  subject: "Frage zu Standgebühr",
  text: "Hallo, gilt der Preis auch für den Antikmarkt?",
  ...over,
});

describe("spamCheck", () => {
  it("leaves normal mail alone", () => {
    expect(spamCheck(mail({}), [])).toEqual({ spam: false, reasons: [] });
  });
  it("flags blocked senders, also by domain", () => {
    expect(spamCheck(mail({ fromAddress: "x@spam.example" }), ["@spam.example"]).reasons).toEqual([
      "blocked_sender",
    ]);
    expect(spamCheck(mail({ fromAddress: "Petra@Example.com" }), ["petra@example.com"]).spam).toBe(
      true,
    );
  });
  it("needs two signals for content rules (one phrase alone is not enough)", () => {
    expect(spamCheck(mail({ text: "Wir bieten SEO für Ihre Seite." }), []).spam).toBe(false);
    const r = spamCheck(
      mail({ text: "SEO! Mehr Ranking: https://a.example https://b.example https://c.example" }),
      [],
    );
    expect(r.spam).toBe(true);
    expect(r.reasons).toEqual(["spam_phrase", "many_links"]);
  });
  it("catches form spam: filled honeypot or impossible stall length", () => {
    expect(
      spamCheck(mail({ text: "Name: Bob\nWebsite: http://cheap.example" }), []).reasons,
    ).toEqual(["honeypot"]);
    expect(spamCheck(mail({ text: "x", formLengthCm: 9900 }), []).reasons).toEqual([
      "impossible_data",
    ]);
  });
});
