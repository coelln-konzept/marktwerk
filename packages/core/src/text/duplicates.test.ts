import { describe, expect, it } from "vitest";
import { sameText, similarContactReason, similarVenueReason } from "./duplicates";

describe("sameText", () => {
  it.each([
    ["Ordnungsamt Köln", "ordnungsamt  köln"],
    ["Ordnungsamt Köln", "Ordnungsamt Koeln"],
    ["Ordnungsamt Köln", "Ordnungsamt Koln"],
    ["Ordnungsamt-Köln", "Ordnungsamt Köln"],
    [" Straße 1 ", "Strasse 1"],
    ["KUX1000", "K UX 1000"],
  ])("%s = %s", (a, b) => {
    expect(sameText(a, b)).toBe(true);
    expect(sameText(b, a)).toBe(true);
  });

  it.each([
    ["Ordnungsamt Köln", "Ordnungsamt Bonn"],
    ["", ""],
    ["–", "–"],
    ["A1", null],
  ])("%s ≠ %s", (a, b) => {
    expect(sameText(a, b)).toBe(false);
  });
});

describe("similarContactReason", () => {
  const existing = {
    name: "Ordnungsamt Köln",
    phone: "+49221123456",
    email: "ordnungsamt@stadt-koeln.de",
  };

  it("matches the name first, ignoring case, spaces and umlauts", () => {
    expect(similarContactReason({ name: "ordnungsamt koeln" }, existing)).toBe("name");
  });

  it("matches the phone number however it is written", () => {
    expect(similarContactReason({ name: "Stadt Köln", phone: "0221 / 12 34 56" }, existing)).toBe(
      "phone",
    );
    // Too short to mean anything.
    expect(
      similarContactReason({ name: "X", phone: "123" }, { name: "Y", phone: "123" }),
    ).toBeNull();
  });

  it("matches the e-mail address without case", () => {
    expect(
      similarContactReason({ name: "Stadt", email: " Ordnungsamt@Stadt-Koeln.de " }, existing),
    ).toBe("email");
  });

  it("returns null for a different contact or empty fields", () => {
    expect(
      similarContactReason({ name: "Bauer Anders", phone: "", email: "" }, existing),
    ).toBeNull();
    expect(similarContactReason({ name: "" }, { name: "" })).toBeNull();
  });
});

describe("similarVenueReason", () => {
  const existing = {
    name: "Köln – Rheinpromenade",
    street: "Rheinuferstraße 1",
    postalCode: "50667",
  };

  it("matches the same name", () => {
    expect(similarVenueReason({ name: "köln - rheinpromenade" }, existing)).toBe("name");
  });

  it("matches the same street at the same postcode under another name", () => {
    expect(
      similarVenueReason(
        { name: "Rheinufer", street: "Rheinuferstrasse 1", postalCode: "50667" },
        existing,
      ),
    ).toBe("address");
  });

  it("does not match the same street in another postcode, or no street at all", () => {
    expect(
      similarVenueReason({ name: "X", street: "Rheinuferstraße 1", postalCode: "50668" }, existing),
    ).toBeNull();
    expect(
      similarVenueReason(
        { name: "X", street: "", postalCode: "50667" },
        { street: "", postalCode: "50667" },
      ),
    ).toBeNull();
  });
});
