import { describe, expect, it } from "vitest";
import { matchesAllWords, searchWords } from "./search";

const fields = ["Ordnungsamt Köln – Veranstaltungen", "Fiete Richards", "Köln"];
const phones = ["+4922112345678"];

describe("searchWords", () => {
  it("splits on whitespace and drops punctuation-only words", () => {
    expect(searchWords("  Köln  –  Ordnungsamt ")).toEqual(["Köln", "Ordnungsamt"]);
    expect(searchWords("   ")).toEqual([]);
  });
});

describe("matchesAllWords", () => {
  it("matches words in any order", () => {
    expect(matchesAllWords(fields, "Köln Ordnungsamt")).toBe(true);
    expect(matchesAllWords(fields, "Veranstaltungen Ordnungsamt Köln")).toBe(true);
  });

  it("matches across different fields", () => {
    expect(matchesAllWords(fields, "fiete ordnungsamt")).toBe(true);
  });

  it("needs every word", () => {
    expect(matchesAllWords(fields, "Köln Düsseldorf")).toBe(false);
  });

  it("folds umlauts and case", () => {
    expect(matchesAllWords(fields, "KOELN ordnungsamt")).toBe(true);
    expect(matchesAllWords(fields, "koln")).toBe(true);
  });

  it("matches a phone number by its digits, however it is written", () => {
    expect(matchesAllWords(fields, "0221 1234", phones)).toBe(true);
    expect(matchesAllWords(fields, "221-12345", phones)).toBe(true);
    expect(matchesAllWords(fields, "+49 221 12345678", phones)).toBe(true);
    expect(matchesAllWords(fields, "0221 9999", phones)).toBe(false);
  });

  it("ignores digit words shorter than three digits for phones", () => {
    expect(matchesAllWords(fields, "22", phones)).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesAllWords(fields, "  ")).toBe(true);
    expect(matchesAllWords([], "", [])).toBe(true);
  });
});
