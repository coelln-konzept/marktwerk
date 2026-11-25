import { describe, expect, it } from "vitest";
import {
  deriveMarketShortCode,
  isMarketShortCode,
  MARKET_SHORT_CODE_MAX,
  marketShortCodes,
  normalizeMarketShortCode,
} from "./market-short-code";

describe("normalizeMarketShortCode", () => {
  it("removes spaces and upper-cases, keeping umlauts", () => {
    expect(normalizeMarketShortCode(" alt ")).toBe("ALT");
    expect(normalizeMarketShortCode("p 6")).toBe("P6");
    expect(normalizeMarketShortCode("süd")).toBe("SÜD");
  });

  it("turns blank input into null (no own Kürzel)", () => {
    expect(normalizeMarketShortCode("")).toBeNull();
    expect(normalizeMarketShortCode("   ")).toBeNull();
    expect(normalizeMarketShortCode(null)).toBeNull();
    expect(normalizeMarketShortCode(undefined)).toBeNull();
  });

  it("leaves invalid input invalid instead of guessing", () => {
    expect(isMarketShortCode(normalizeMarketShortCode("A-B"))).toBe(false);
    expect(isMarketShortCode(normalizeMarketShortCode("abcde"))).toBe(false);
    // ß upper-cases to SS: "straß" → "STRASS", five characters.
    expect(normalizeMarketShortCode("straß")).toBe("STRASS");
    expect(isMarketShortCode("STRASS")).toBe(false);
  });
});

describe("isMarketShortCode", () => {
  it("accepts 1–4 upper-case letters, umlauts and digits", () => {
    for (const code of ["S", "LS", "P6", "ALT", "SÜD", "RMAT", "2027"])
      expect(isMarketShortCode(code)).toBe(true);
  });

  it("rejects lower case, spaces, signs, ß, empty and too long codes", () => {
    for (const code of ["alt", "A T", "A-B", "ß", "", "ABCDE", "É"])
      expect(isMarketShortCode(code)).toBe(false);
    expect(isMarketShortCode(null)).toBe(false);
    expect(isMarketShortCode(42)).toBe(false);
  });
});

describe("deriveMarketShortCode", () => {
  it("takes the first three characters of a one-word name", () => {
    expect(deriveMarketShortCode("Altstadt")).toBe("ALT");
    expect(deriveMarketShortCode("Nippes")).toBe("NIP");
    expect(deriveMarketShortCode("Südstadt")).toBe("SÜD");
    expect(deriveMarketShortCode("P6")).toBe("P6");
  });

  it("takes the initials of several words, at most four", () => {
    expect(deriveMarketShortCode("Kerpen Stadtfest")).toBe("KS");
    expect(deriveMarketShortCode("Riehler Gürtel")).toBe("RG");
    expect(deriveMarketShortCode("Nippes, Wilhelmplatz")).toBe("NW");
    expect(deriveMarketShortCode("Rodenkirchen Maternusplatz (Antik)")).toBe("RMA");
    expect(deriveMarketShortCode("Rodenkirchen Maternusplatz (Antik / Trödel)")).toBe("RMAT");
    expect(deriveMarketShortCode("Eins Zwei Drei Vier Fünf")).toHaveLength(MARKET_SHORT_CODE_MAX);
  });

  it("keeps numbers whole and skips articles and prepositions", () => {
    expect(deriveMarketShortCode("Halle 7")).toBe("H7");
    expect(deriveMarketShortCode("Platz am Dom")).toBe("PD");
    expect(deriveMarketShortCode("Markt am Dom")).toBe("DOM");
    expect(deriveMarketShortCode("Flohmarkt an der Südbrücke")).toBe("SÜD");
  });

  it("drops words like Flohmarkt unless nothing else is left", () => {
    expect(deriveMarketShortCode("Kerpener Trödelmarkt")).toBe("KER");
    expect(deriveMarketShortCode("Flohmarkt Nippes")).toBe("NIP");
    expect(deriveMarketShortCode("Flohmarkt")).toBe("FLO");
  });

  it("folds accents to their base letter and drops other signs", () => {
    expect(deriveMarketShortCode("Café Größe")).toBe("CG");
    expect(deriveMarketShortCode("Élysée")).toBe("ELY");
    expect(deriveMarketShortCode("Straße")).toBe("STR");
  });

  it("falls back to M for a name without letters or digits", () => {
    expect(deriveMarketShortCode("–")).toBe("M");
    expect(deriveMarketShortCode("")).toBe("M");
  });

  it("avoids taken codes, readable first, numbered last", () => {
    expect(deriveMarketShortCode("Südbrücke", ["SÜD"])).toBe("SÜDB");
    expect(deriveMarketShortCode("Südbrücke", ["SÜD", "SÜDB"])).toBe("SÜB");
    expect(deriveMarketShortCode("RheinEnergie Stadion", ["RS"])).toBe("RST");
    expect(deriveMarketShortCode("RheinEnergie Stadion", ["RS", "RST", "RSTA"])).toBe("RHS");
    expect(deriveMarketShortCode("P6", ["P6"])).toBe("P62");
    expect(deriveMarketShortCode("–", ["M"])).toBe("M2");
  });

  it("always returns a valid code", () => {
    for (const name of ["Altstadt", "a", "1", "Ü", "Rodenkirchen Hauptstraße", "x y z w v u"]) {
      expect(isMarketShortCode(deriveMarketShortCode(name))).toBe(true);
      expect(isMarketShortCode(deriveMarketShortCode(name, ["A", "1", "Ü", "RH", "X"]))).toBe(true);
    }
  });
});

describe("marketShortCodes", () => {
  it("keeps own codes and derives the others around them", () => {
    const codes = marketShortCodes([
      { id: "a", name: "Altstadt", shortCode: "ALT" },
      { id: "b", name: "Altstadt Lifestyle", shortCode: null },
      { id: "c", name: "Alter Markt", shortCode: null },
      { id: "d", name: "Altenberg", shortCode: null },
    ]);
    expect(codes.get("a")).toBe("ALT");
    expect(codes.get("b")).toBe("AL");
    // In name order: "Altenberg" → "ALT" is taken, so "ALTE"; "Alter Markt" (Markt is dropped) → "ALE".
    expect(codes.get("c")).toBe("ALE");
    expect(codes.get("d")).toBe("ALTE");
  });

  it("keeps derived codes apart from each other, in name order whatever the input order", () => {
    const markets = [
      { id: "1", name: "Südstadt", shortCode: null },
      { id: "2", name: "Südbrücke", shortCode: null },
    ];
    const forward = marketShortCodes(markets);
    const backward = marketShortCodes([...markets].reverse());
    // "Südbrücke" sorts first and gets the plain "SÜD".
    expect(forward.get("2")).toBe("SÜD");
    expect(forward.get("1")).toBe("SÜDS");
    expect(backward).toEqual(forward);
  });

  it("ignores an invalid stored code and derives one instead", () => {
    const codes = marketShortCodes([{ id: "x", name: "Nippes", shortCode: "nip!" }]);
    expect(codes.get("x")).toBe("NIP");
  });

  it("returns nothing for no markets", () => {
    expect(marketShortCodes([]).size).toBe(0);
  });
});
