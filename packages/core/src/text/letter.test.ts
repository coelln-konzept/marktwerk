import { describe, expect, it } from "vitest";
import { initialLetter, parseLetterParam } from "./letter";

describe("initialLetter", () => {
  it("uses the first letter, upper case", () => {
    expect(initialLetter("Müller")).toBe("M");
    expect(initialLetter("antik & mehr")).toBe("A");
  });

  it("folds umlauts and accents to their base letter", () => {
    expect(initialLetter("Ärztehaus")).toBe("A");
    expect(initialLetter("Östlich")).toBe("O");
    expect(initialLetter("Übel")).toBe("U");
    expect(initialLetter("Élan")).toBe("E");
    expect(initialLetter("ça va")).toBe("C");
    expect(initialLetter("ßtrand")).toBe("S");
    // decomposed form (a + combining diaeresis)
    expect(initialLetter("Ärger")).toBe("A");
  });

  it("skips leading whitespace, quotes and brackets", () => {
    expect(initialLetter("  Bauer")).toBe("B");
    expect(initialLetter('"Zum Löwen"')).toBe("Z");
    expect(initialLetter("„Kunst“ GmbH")).toBe("K");
    expect(initialLetter("(Dr.) Hahn")).toBe("D");
    expect(initialLetter(" 'n Tüddel")).toBe("N");
  });

  it("files digits, symbols and empty names under #", () => {
    expect(initialLetter("4 Jahreszeiten")).toBe("#");
    expect(initialLetter("1. Trödel")).toBe("#");
    expect(initialLetter("& Co")).toBe("#");
    expect(initialLetter("Øresund")).toBe("#");
    expect(initialLetter("")).toBe("#");
    expect(initialLetter("   ")).toBe("#");
    expect(initialLetter('""')).toBe("#");
    expect(initialLetter(null)).toBe("#");
    expect(initialLetter(undefined)).toBe("#");
  });
});

describe("parseLetterParam", () => {
  it("accepts A–Z and #, nothing else", () => {
    expect(parseLetterParam("A")).toBe("A");
    expect(parseLetterParam("Z")).toBe("Z");
    expect(parseLetterParam("#")).toBe("#");
    expect(parseLetterParam("a")).toBeUndefined();
    expect(parseLetterParam("AB")).toBeUndefined();
    expect(parseLetterParam("Ä")).toBeUndefined();
    expect(parseLetterParam("")).toBeUndefined();
    expect(parseLetterParam(undefined)).toBeUndefined();
  });
});
