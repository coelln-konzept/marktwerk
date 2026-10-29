import { describe, expect, it } from "vitest";
import {
  escapeLike,
  foldText,
  formatIsoDates,
  phoneDigits,
  scoreMatch,
  tokenize,
} from "@/lib/search-query";

/** Pure rules of the command palette search (words, umlauts, ranking, phone numbers). */

describe("tokenize", () => {
  it("splits into folded words without duplicates", () => {
    expect(tokenize("  Flohmarkt  Köln  2026 köln")).toEqual(["flohmarkt", "koln", "2026"]);
    expect(tokenize("Straße")).toEqual(["strase"]);
    expect(tokenize("25.11.")).toEqual(["25.11."]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("looks at six words at most", () => {
    expect(tokenize("a b c d e f g h")).toHaveLength(6);
  });
});

describe("foldText / escapeLike", () => {
  it("folds like the SQL side", () => {
    expect(foldText("Müller-Öl, Café")).toBe("muller-ol, cafe");
  });
  it("escapes like wildcards", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("scoreMatch", () => {
  it("ranks a title that starts with the query best", () => {
    expect(scoreMatch("aussteller", "Aussteller öffnen")).toBe(0);
    expect(scoreMatch("flohmarkt bonn", "Flohmarkt Bonn")).toBe(0);
  });
  it("then every word starting a word of the title", () => {
    expect(scoreMatch("bonn", "Flohmarkt Bonn")).toBe(1);
    expect(scoreMatch("bonn floh", "Flohmarkt Bonn")).toBe(1);
  });
  it("then words from the secondary text", () => {
    expect(scoreMatch("händler", "Aussteller öffnen", "beschicker händler")).toBe(2);
  });
  it("fragments inside words come last", () => {
    expect(scoreMatch("bonn", "Newsletter an Abonnent:innen")).toBe(3);
  });
  it("is null without a match, and umlaut-insensitive", () => {
    expect(scoreMatch("bonn", "Köln")).toBeNull();
    expect(scoreMatch("koln", "Köln")).toBe(0);
    expect(scoreMatch("", "Köln")).toBeNull();
  });
});

describe("formatIsoDates", () => {
  it("shows ISO dates as dates", () => {
    expect(formatIsoDates("Halteverbot (Verkehrszeichen) – 2026-04-18", "de")).toBe(
      "Halteverbot (Verkehrszeichen) – 18.04.2026",
    );
    expect(formatIsoDates("Plan 2026-13-45", "de")).toBe("Plan 2026-13-45");
  });
});

describe("phoneDigits", () => {
  it("turns what people type into stored digits", () => {
    expect(phoneDigits("0221 123456")).toBe("49221123456");
    expect(phoneDigits("+49 221 1234")).toBe("492211234");
    expect(phoneDigits("0049 221 1234")).toBe("492211234");
  });
  it("ignores dates, years and words", () => {
    expect(phoneDigits("25.11.")).toBeNull();
    expect(phoneDigits("2026")).toBeNull();
    expect(phoneDigits("Köln 0221")).toBeNull();
    expect(phoneDigits("02")).toBeNull();
  });
});
