import { describe, expect, it } from "vitest";
import {
  parseGermanDate,
  parseLengthCm,
  parseSpotPreference,
  parseStallRequestMail,
} from "./request-mail";

const body = `Neue Standanfrage über das Formular auf coelln-konzept.de
---
Veranstaltung: Flohmarkt Heumarkt
Termine: 04.04.2027, 02.05.2027
Name: Petra Schmitz
Firma:
Art: privat
E-Mail: petra.schmitz@example.com
Telefon: 0221 123456
Standlänge: 3,5 m
Auto am Stand: ja
Autolänge: 5 m
Strom: nein
Sortiment: Trödel, Bücher
Stammplatz: Reihe A, ca. 40 m
Anmerkung: Bitte neben meiner Schwester (Stand A-38).
Wir kommen um 6 Uhr.
---
Anfrage-ID: CK-2027-000123`;

describe("parseStallRequestMail", () => {
  it("reads every field of a form mail", () => {
    const r = parseStallRequestMail({ subject: "Standanfrage – Flohmarkt Heumarkt", body });
    expect(r.kind).toBe("request");
    if (r.kind !== "request" || !r.ok) throw new Error("expected ok");
    expect(r.request).toMatchObject({
      requestRef: "CK-2027-000123",
      eventName: "Flohmarkt Heumarkt",
      dates: ["2027-04-04", "2027-05-02"],
      name: "Petra Schmitz",
      companyName: null,
      kind: "private",
      lengthCm: 350,
      carRequested: true,
      carLengthCm: 500,
      power: false,
      categories: ["Trödel", "Bücher"],
      preferredSpot: { rowLabel: "A", offsetCm: 4000 },
    });
    expect(r.request.note).toBe("Bitte neben meiner Schwester (Stand A-38).\nWir kommen um 6 Uhr.");
    expect(r.warnings).toEqual([]);
  });

  it("ignores mails that are not form requests", () => {
    expect(parseStallRequestMail({ subject: "Rechnung Oktober", body: "Hallo" }).kind).toBe(
      "not_a_request",
    );
  });

  it("accepts reply/forward prefixes on the subject", () => {
    const r = parseStallRequestMail({ subject: "WG: AW: Standanfrage – X", body });
    expect(r.kind === "request" && r.ok).toBe(true);
  });

  it("lists every broken field instead of guessing", () => {
    const broken = body
      .replace("Termine: 04.04.2027, 02.05.2027", "Termine: 31.02.2027")
      .replace("Standlänge: 3,5 m", "Standlänge: viel")
      .replace("E-Mail: petra.schmitz@example.com", "E-Mail: petra(at)example");
    const r = parseStallRequestMail({ subject: "Standanfrage", body: broken });
    if (r.kind !== "request" || r.ok) throw new Error("expected errors");
    expect(r.errors.map((e) => e.field).sort()).toEqual(["dates", "email", "lengthCm"]);
  });

  it("warns (not fails) when a car has no length and defaults to 5 m", () => {
    const r = parseStallRequestMail({
      subject: "Standanfrage",
      body: body.replace("Autolänge: 5 m\n", ""),
    });
    if (r.kind !== "request" || !r.ok) throw new Error("expected ok");
    expect(r.request.carLengthCm).toBe(500);
    expect(r.warnings).toEqual([{ field: "carLengthCm", code: "missing", value: undefined }]);
  });
});

describe("field readers", () => {
  it("reads lengths", () => {
    expect(parseLengthCm("4 m")).toBe(400);
    expect(parseLengthCm("3,5m")).toBe(350);
    expect(parseLengthCm("350 cm")).toBe(350);
    expect(parseLengthCm("4")).toBe(400);
    expect(parseLengthCm("0 m")).toBeNull();
    expect(parseLengthCm("vier")).toBeNull();
  });

  it("rejects impossible dates, including 29.02. outside leap years", () => {
    expect(parseGermanDate("29.02.2028")).toBe("2028-02-29");
    expect(parseGermanDate("29.02.2027")).toBeNull();
    expect(parseGermanDate("1.4.2027")).toBe("2027-04-01");
  });

  it("reads Stammplatz text the way vendors write it", () => {
    expect(parseSpotPreference("Reihe B, ca. 17 m")).toMatchObject({
      rowLabel: "B",
      offsetCm: 1700,
    });
    expect(parseSpotPreference("Reihe C")).toMatchObject({ rowLabel: "C", offsetCm: null });
    expect(parseSpotPreference("")).toBeNull();
  });
});
