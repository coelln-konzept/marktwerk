import { describe, expect, it } from "vitest";
import { extractSignatureFields } from "./signature-fields";

describe("extractSignatureFields", () => {
  it("finds phone, company and address in a German signature", () => {
    const f = extractSignatureFields(
      "Mit freundlichen Grüßen\nAnna Berg\nStadt Köln – Ordnungsamt\nWilly-Brandt-Platz 3\n50679 Köln\nTel. 0221 221-12345",
    );
    expect(f).toEqual({
      phone: "0221 221-12345",
      company: "Stadt Köln – Ordnungsamt",
      street: "Willy-Brandt-Platz 3",
      postalCity: "50679 Köln",
    });
  });
  it("reads +49 numbers and returns nulls when nothing matches", () => {
    expect(extractSignatureFields("Gruß\nLars\nMobil: +49 171 2345678").phone).toBe(
      "+49 171 2345678",
    );
    expect(extractSignatureFields("Hallo")).toEqual({
      phone: null,
      company: null,
      street: null,
      postalCity: null,
    });
  });
});
