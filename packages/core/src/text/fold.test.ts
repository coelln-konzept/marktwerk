import { describe, expect, it } from "vitest";
import { foldIncludes } from "./fold";

describe("foldIncludes", () => {
  it("finds umlauts with and without transliteration", () => {
    expect(foldIncludes(["Köln"], "koeln")).toBe(true);
    expect(foldIncludes(["Köln"], "koln")).toBe(true);
    expect(foldIncludes(["Köln"], "KÖLN")).toBe(true);
    expect(foldIncludes(["Koeln"], "köln")).toBe(true);
    expect(foldIncludes(["Düsseldorf"], "duesseldorf")).toBe(true);
  });

  it("treats ß like ss", () => {
    expect(foldIncludes(["Neusser Straße"], "strasse")).toBe(true);
    expect(foldIncludes(["Strasse"], "straße")).toBe(true);
  });

  it("searches several fields and skips empty ones", () => {
    expect(foldIncludes([null, undefined, "Fiete Richards"], "richards")).toBe(true);
    expect(foldIncludes(["Köln"], "bonn")).toBe(false);
  });

  it("matches everything for an empty needle", () => {
    expect(foldIncludes(["x"], "  ")).toBe(true);
  });
});
