import { describe, expect, it } from "vitest";
import { bundleFileName, safeFileName, slugForFileName, sniffDocumentType } from "./files";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe("sniffDocumentType", () => {
  it("recognises PDF, JPEG, PNG, HEIC and XML by their first bytes", () => {
    expect(sniffDocumentType(bytes("%PDF-1.7\n%âãÏÓ"))?.ext).toBe("pdf");
    expect(sniffDocumentType(bytes([0xff, 0xd8, 0xff, 0xe0], "padding-bytes"))?.mime).toBe(
      "image/jpeg",
    );
    expect(
      sniffDocumentType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], "IHDR....")),
    ).toMatchObject({
      mime: "image/png",
    });
    expect(sniffDocumentType(bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0]))?.mime).toBe(
      "image/heic",
    );
    expect(sniffDocumentType(bytes([0, 0, 0, 0x18], "ftypmif1", [0, 0, 0, 0]))?.ext).toBe("heic");
    expect(sniffDocumentType(bytes("\n  <?xml version='1.0'?><Invoice/>"))?.mime).toBe(
      "application/xml",
    );
  });

  it("rejects everything else, whatever the extension says", () => {
    expect(
      sniffDocumentType(bytes("MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0004\u0000\u0000\u0000")),
    ).toBeNull();
    expect(sniffDocumentType(bytes("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(sniffDocumentType(bytes("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000"))).toBeNull();
    expect(sniffDocumentType(new Uint8Array(0))).toBeNull();
    expect(sniffDocumentType(bytes("%PDF"))).toBeNull();
  });
});

describe("file names", () => {
  it("strips paths and control characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\Beleg 1.pdf")).toBe("Beleg 1.pdf");
    expect(safeFileName('a"b<c>.pdf')).toBe("abc.pdf");
    expect(safeFileName("..")).toBe("datei");
    expect(safeFileName("")).toBe("datei");
  });

  it("makes ASCII slugs with umlaut transliteration", () => {
    expect(slugForFileName("Müller & Söhne GmbH")).toBe("Mueller-Soehne-GmbH");
    expect(slugForFileName("Café Straße")).toBe("Cafe-Strasse");
    expect(slugForFileName("")).toBe("");
  });

  it("builds the tax advisor bundle name and leaves empty parts out", () => {
    expect(
      bundleFileName({
        date: "2026-10-05",
        counterparty: "Dixi Toiletten",
        amountCents: 90_000,
        event: "Stadtfest Neuss",
        ext: "pdf",
      }),
    ).toBe("2026-10-05_Dixi-Toiletten_900.00_Stadtfest-Neuss.pdf");
    expect(bundleFileName({ date: "2026-10-05", amountCents: 6420, ext: "jpg" })).toBe(
      "2026-10-05_64.20.jpg",
    );
  });
});
