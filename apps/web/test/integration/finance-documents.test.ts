import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { DOCUMENT_MAX_BYTES } from "@marktwerk/core";
import { auditLog, document } from "@marktwerk/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  financeKpis,
  getPayable,
  listExpenses,
  listMissingReceipts,
} from "@/server/queries/finance";
import {
  archiveDocument,
  createDocument,
  DocumentInputError,
  readDocument,
  restoreDocument,
} from "@/server/services/documents";
import { createExpense } from "@/server/services/expenses";
import { createPayable, markInstallmentPaid } from "@/server/services/payables";
import {
  type BundleLabels,
  buildReceiptBundle,
  collectReceiptMonth,
  planBundle,
} from "@/server/services/receipt-bundle";
import {
  createLocalStorage,
  createS3Storage,
  getStorage,
  StorageNotConfiguredError,
  setStorageForTests,
  sha256Hex,
} from "@/server/storage";
import { zipBuffer } from "@/server/zip";
import { createActor, resetDatabase } from "../helpers/fixtures";

const TODAY = "2026-10-21";

let dir: string;
let owner: Awaited<ReturnType<typeof createActor>>;
let manager: Awaited<ReturnType<typeof createActor>>;
let staff: Awaited<ReturnType<typeof createActor>>;
let field: Awaited<ReturnType<typeof createActor>>;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "marktwerk-files-"));
  setStorageForTests(createLocalStorage(dir));
});

afterAll(async () => {
  setStorageForTests(null);
  await rm(dir, { recursive: true, force: true });
  await db.$client.end();
});

beforeEach(async () => {
  await resetDatabase();
  owner = await createActor("owner");
  manager = await createActor("manager");
  staff = await createActor("staff");
  field = await createActor("field");
});

const isForbidden = (error: unknown) =>
  String((error as { digest?: unknown })?.digest ?? "").includes("403");

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
/** A tiny but recognisable PDF; `seed` makes the content (and the hash) differ. */
const pdf = (seed = "a") => bytes(`%PDF-1.4\n% ${seed}\n1 0 obj<<>>endobj\n%%EOF`);
const jpeg = (seed = "a") => bytes([0xff, 0xd8, 0xff, 0xe0], `JFIF ${seed} padding padding`);

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DocumentInputError) return error.code;
    throw error;
  }
  return null;
};

const audits = (action: string) => db.select().from(auditLog).where(eq(auditLog.action, action));

/** A paid payable (one rate of 100 €, paid on 2026-10-05) and an unpaid one; returns the rate ids. */
async function seedPayments() {
  const a = await createPayable(
    owner,
    {
      title: "Toiletten Rahmenvertrag",
      scope: "company",
      category: "toilets",
      totalGrossCents: 20_000,
    },
    [
      { dueOn: "2026-10-01", amountCents: 10_000 },
      { dueOn: "2026-11-01", amountCents: 10_000 },
    ],
  );
  const pa = await getPayable(owner, a.id, TODAY);
  const [r1, r2] = pa?.installments ?? [];
  if (!r1 || !r2) throw new Error("no rates");
  await markInstallmentPaid(
    owner,
    r1.id,
    { paidOn: "2026-10-05", amountCents: 10_000, method: "bank_transfer", reference: "RE-77" },
    { today: TODAY },
  );
  return { payableId: a.id, paid: r1.id, open: r2.id };
}

describe("storage", () => {
  it("keeps the bytes exactly and refuses to overwrite a key", async () => {
    const storage = getStorage();
    const data = pdf("storage");
    const sha = sha256Hex(data);
    const key = `${sha.slice(0, 2)}/${sha}-00000000-0000-4000-8000-000000000001.pdf`;
    await storage.put(key, data);
    expect(await storage.exists(key)).toBe(true);
    expect(Buffer.from(await storage.get(key)).equals(Buffer.from(data))).toBe(true);
    await expect(storage.put(key, data)).rejects.toThrow();
    await expect(storage.get(key.replace("0001", "0002"))).rejects.toThrow();
    // A key that could leave the directory is not even accepted.
    await expect(storage.get("../../etc/passwd")).rejects.toThrow("invalid storage key");
  });

  it("has an S3 driver that is not configured yet", async () => {
    const s3 = createS3Storage();
    await expect(s3.put("x", new Uint8Array())).rejects.toBeInstanceOf(StorageNotConfiguredError);
  });
});

describe("uploading documents", () => {
  it("stores the file as it came, hashes it and audits the upload", async () => {
    const { paid } = await seedPayments();
    const data = pdf("receipt");
    const created = await createDocument(owner, {
      fileName: "../Rechnung Toilettenmiete.pdf",
      bytes: data,
      link: { installmentId: paid },
    });
    expect(created).toMatchObject({
      fileName: "Rechnung Toilettenmiete.pdf",
      kind: "receipt",
      mime: "application/pdf",
    });

    const [row] = await db.select().from(document).where(eq(document.id, created.id));
    expect(row).toMatchObject({
      installmentId: paid,
      mimeType: "application/pdf",
      sizeBytes: data.length,
      sha256: sha256Hex(data),
    });
    expect(row?.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{64}-[0-9a-f-]{36}\.pdf$/);
    const { bytes: stored } = await readDocument(owner, created.id);
    expect(Buffer.from(stored).equals(Buffer.from(data))).toBe(true);
    const [entry] = await audits("document.upload");
    expect(entry).toMatchObject({
      entityType: "document",
      entityId: created.id,
      actorId: owner.id,
    });
    // Files really are on disk under ./<prefix>/…
    expect(
      (await readdir(path.join(dir, row?.storageKey.slice(0, 2) ?? ""))).length,
    ).toBeGreaterThan(0);
  });

  it("accepts PDF, JPEG, PNG and HEIC, and XML only as e-invoice", async () => {
    const { paid } = await seedPayments();
    const link = { installmentId: paid };
    const png = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], "IHDR padding");
    const heic = bytes([0, 0, 0, 0x18], "ftypheic", [0, 0, 0, 0], "padding");
    const xml = bytes('<?xml version="1.0"?><Invoice>x</Invoice>');
    expect((await createDocument(owner, { fileName: "a.jpg", bytes: jpeg(), link })).mime).toBe(
      "image/jpeg",
    );
    expect((await createDocument(owner, { fileName: "a.png", bytes: png, link })).mime).toBe(
      "image/png",
    );
    expect((await createDocument(owner, { fileName: "a.heic", bytes: heic, link })).mime).toBe(
      "image/heic",
    );
    expect(await code(createDocument(owner, { fileName: "a.xml", bytes: xml, link }))).toBe(
      "unsupported_type",
    );
    const e = await createDocument(owner, {
      fileName: "a.xml",
      bytes: xml,
      link,
      kind: "e_invoice_xml",
    });
    expect(e).toMatchObject({ mime: "application/xml", kind: "e_invoice_xml" });
  });

  it("refuses other types whatever the name says, empty files and files that are too large", async () => {
    const { paid } = await seedPayments();
    const link = { installmentId: paid };
    expect(
      await code(
        createDocument(owner, {
          fileName: "x.pdf",
          bytes: bytes("<html><script>1</script></html>"),
          link,
        }),
      ),
    ).toBe("unsupported_type");
    expect(
      await code(
        createDocument(owner, {
          fileName: "x.jpg",
          bytes: bytes("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]),
          link,
        }),
      ),
    ).toBe("unsupported_type");
    expect(
      await code(createDocument(owner, { fileName: "x.pdf", bytes: new Uint8Array(0), link })),
    ).toBe("empty_file");
    const huge = new Uint8Array(DOCUMENT_MAX_BYTES + 1);
    huge.set(pdf());
    expect(await code(createDocument(owner, { fileName: "x.pdf", bytes: huge, link }))).toBe(
      "too_large",
    );
    expect(await db.select().from(document)).toHaveLength(0);
  });

  it("validates the link and the kind, and refuses the same file twice on one record", async () => {
    const { paid } = await seedPayments();
    expect(await code(createDocument(owner, { fileName: "x.pdf", bytes: pdf(), link: {} }))).toBe(
      "no_link",
    );
    expect(
      await code(
        createDocument(owner, { fileName: "x.pdf", bytes: pdf(), link: { installmentId: "nope" } }),
      ),
    ).toBe("invalid_link");
    expect(
      await code(
        createDocument(owner, {
          fileName: "x.pdf",
          bytes: pdf(),
          link: { installmentId: "00000000-0000-4000-8000-000000000000" },
        }),
      ),
    ).toBe("link_not_found");
    expect(
      await code(
        createDocument(owner, {
          fileName: "x.pdf",
          bytes: pdf(),
          link: { installmentId: paid },
          kind: "bogus",
        }),
      ),
    ).toBe("invalid_kind");
    // Unknown link columns are ignored, so a link made only of them is "no link".
    expect(
      await code(
        createDocument(owner, { fileName: "x.pdf", bytes: pdf(), link: { somethingElse: paid } }),
      ),
    ).toBe("no_link");

    await createDocument(owner, {
      fileName: "x.pdf",
      bytes: pdf("dup"),
      link: { installmentId: paid },
    });
    expect(
      await code(
        createDocument(owner, {
          fileName: "again.pdf",
          bytes: pdf("dup"),
          link: { installmentId: paid },
        }),
      ),
    ).toBe("duplicate");
  });

  it("needs the write grant of the linked record; reading needs the read grant", async () => {
    const { paid, payableId } = await seedPayments();
    for (const actor of [staff, field]) {
      let error: unknown;
      try {
        await createDocument(actor, {
          fileName: "x.pdf",
          bytes: pdf(),
          link: { installmentId: paid },
        });
      } catch (e) {
        error = e;
      }
      expect(isForbidden(error)).toBe(true);
    }
    const created = await createDocument(manager, {
      fileName: "x.pdf",
      bytes: pdf("m"),
      link: { payableId },
    });
    expect(created.kind).toBe("invoice");
    for (const actor of [staff, field]) {
      let error: unknown;
      try {
        await readDocument(actor, created.id);
      } catch (e) {
        error = e;
      }
      expect(isForbidden(error)).toBe(true);
    }
    expect((await readDocument(manager, created.id)).row.fileName).toBe("x.pdf");
  });

  it("is generic: a document can hang on another module's record", async () => {
    const { venue } = await import("@marktwerk/db/schema");
    const [place] = await db
      .insert(venue)
      .values({ name: "Platz", kind: "outdoor_public", city: "Köln" })
      .returning();
    if (!place) throw new Error("venue");
    // Venue documents follow the venue grants (staff may read, only owner/manager write).
    const created = await createDocument(owner, {
      fileName: "vertrag.pdf",
      bytes: pdf("v"),
      link: { venueId: place.id },
      kind: "contract",
    });
    expect((await readDocument(staff, created.id)).row.venueId).toBe(place.id);
    let error: unknown;
    try {
      await createDocument(staff, {
        fileName: "x.pdf",
        bytes: pdf("v2"),
        link: { venueId: place.id },
      });
    } catch (e) {
      error = e;
    }
    expect(isForbidden(error)).toBe(true);
  });
});

describe("removing documents (soft delete)", () => {
  it("archives with who and why, keeps row and file, and can restore", async () => {
    const { paid } = await seedPayments();
    const data = pdf("keep");
    const created = await createDocument(owner, {
      fileName: "x.pdf",
      bytes: data,
      link: { installmentId: paid },
    });
    await archiveDocument(owner, created.id, "falsche Datei");
    const [row] = await db.select().from(document).where(eq(document.id, created.id));
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.archiveReason).toBe("falsche Datei");
    expect(await getStorage().exists(row?.storageKey ?? "")).toBe(true);
    expect(await code(readDocument(owner, created.id))).toBe("not_found");
    expect(await code(archiveDocument(owner, created.id))).toBe("not_found");
    expect((await audits("document.archive")).length).toBe(1);

    await restoreDocument(owner, created.id);
    expect((await readDocument(owner, created.id)).row.archivedAt).toBeNull();
    expect((await audits("document.restore")).length).toBe(1);
  });

  it("is forbidden without the write grant", async () => {
    const { paid } = await seedPayments();
    const created = await createDocument(owner, {
      fileName: "x.pdf",
      bytes: pdf("f"),
      link: { installmentId: paid },
    });
    let error: unknown;
    try {
      await archiveDocument(staff, created.id);
    } catch (e) {
      error = e;
    }
    expect(isForbidden(error)).toBe(true);
  });
});

describe('"Beleg fehlt"', () => {
  it("counts paid rates and expenses without a receipt, and clears them when one is attached", async () => {
    const { paid, open, payableId } = await seedPayments();
    const exp = await createExpense(
      owner,
      {
        spentOn: "2026-10-06",
        amountCents: 6_420,
        category: "transport_fuel",
        description: "Tanken Transporter",
        merchant: "Aral",
      },
      { today: TODAY },
    );

    // The unpaid rate doesn't count; the paid rate and the expense do.
    let missing = await listMissingReceipts(owner);
    expect(missing.map((m) => [m.kind, m.id])).toEqual([
      ["expense", exp.id],
      ["installment", paid],
    ]);
    expect((await financeKpis(owner, TODAY)).missingReceipts).toBe(2);
    expect(missing.find((m) => m.kind === "installment")).toMatchObject({
      title: "Toiletten Rahmenvertrag",
      amountCents: 10_000,
      date: "2026-10-05",
    });
    expect(open).toBeTruthy();

    const receipt = await createDocument(owner, {
      fileName: "tanken.jpg",
      bytes: jpeg("tank"),
      link: { expenseId: exp.id },
    });
    missing = await listMissingReceipts(owner);
    expect(missing.map((m) => m.kind)).toEqual(["installment"]);

    // A receipt that is removed again makes it missing again.
    await archiveDocument(owner, receipt.id);
    expect((await listMissingReceipts(owner)).length).toBe(2);
    await restoreDocument(owner, receipt.id);

    // An invoice on the payable covers its rates.
    await createDocument(owner, {
      fileName: "rechnung.pdf",
      bytes: pdf("inv"),
      link: { payableId },
    });
    expect(await listMissingReceipts(owner)).toEqual([]);
    expect((await financeKpis(owner, TODAY)).missingReceipts).toBe(0);

    // The rate view shows the same.
    const p = await getPayable(owner, payableId, TODAY);
    expect(p?.installments[0]?.receiptMissing).toBe(false);
    expect(p?.documents.map((d) => d.fileName)).toEqual(["rechnung.pdf"]);
  });

  it("counts a part payment and ignores photos and contracts", async () => {
    const { open } = await seedPayments();
    await markInstallmentPaid(
      owner,
      open,
      { paidOn: "2026-10-10", amountCents: 2_000 },
      { today: TODAY },
    );
    expect((await listMissingReceipts(owner)).length).toBe(2);
    await createDocument(owner, {
      fileName: "foto.jpg",
      bytes: jpeg("p"),
      link: { installmentId: open },
      kind: "photo",
    });
    await createDocument(owner, {
      fileName: "v.pdf",
      bytes: pdf("c"),
      link: { installmentId: open },
      kind: "contract",
    });
    expect((await listMissingReceipts(owner)).length).toBe(2);
    await createDocument(owner, {
      fileName: "b.pdf",
      bytes: pdf("b"),
      link: { installmentId: open },
    });
    expect((await listMissingReceipts(owner)).length).toBe(1);
  });

  it("is empty for roles without finance:read", async () => {
    await seedPayments();
    expect(await listMissingReceipts(staff)).toEqual([]);
    expect(await listMissingReceipts(field)).toEqual([]);
    expect(await listExpenses(staff)).toEqual([]);
  });
});

/** Minimal zip reader for the tests: central directory → entries (name → bytes). */
function readZip(zip: Buffer) {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const csize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const dataAt = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const raw = zip.subarray(dataAt, dataAt + csize);
    const content = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    expect(content.length).toBe(size);
    expect(crc32(content)).toBe(crc);
    files.set(name, content);
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return files;
}

const labels: BundleLabels = {
  header: [
    "Datum",
    "Art",
    "Lieferant",
    "Beschreibung",
    "Kategorie",
    "Veranstaltung",
    "Betrag (EUR)",
    "Zahlart",
    "Verwendungszweck",
    "Beleg",
    "Beleg fehlt",
  ],
  type: { installment: "Rate", expense: "Ausgabe" },
  yes: "ja",
  no: "nein",
  category: (k) => `cat:${k}`,
  method: (k) => `m:${k}`,
  folder: "belege",
  csvName: "belege-2026-10.csv",
};

describe("zip writer", () => {
  it("writes a valid archive with UTF-8 names, stored and deflated entries", async () => {
    const big = Buffer.from("Zeile\n".repeat(500));
    const zip = await zipBuffer([
      { name: "liste.csv", read: () => big, compress: true },
      { name: "belege/Müller-Söhne.pdf", read: () => pdf("z") },
      { name: "leer.txt", read: () => new Uint8Array(0) },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["liste.csv", "belege/Müller-Söhne.pdf", "leer.txt"]);
    expect(files.get("liste.csv")?.equals(big)).toBe(true);
    expect(Buffer.from(pdf("z")).equals(files.get("belege/Müller-Söhne.pdf") as Buffer)).toBe(true);
    expect(files.get("leer.txt")?.length).toBe(0);
    // Deflate really shrank the repetitive CSV.
    expect(zip.length).toBeLessThan(big.length);
  });
});

describe("monthly bundle for the tax advisor", () => {
  it("collects the payments of the month with their receipts and flags the missing ones", async () => {
    const { paid, payableId } = await seedPayments();
    const exp = await createExpense(
      owner,
      {
        spentOn: "2026-10-06",
        amountCents: 6_420,
        category: "transport_fuel",
        description: 'Tanken; mit "Quote"',
        merchant: "=Tankstelle",
      },
      { today: TODAY },
    );
    await createExpense(
      owner,
      { spentOn: "2026-09-30", amountCents: 100, category: "other", description: "Vormonat" },
      { today: TODAY },
    );
    const rateReceipt = await createDocument(owner, {
      fileName: "r.pdf",
      bytes: pdf("rate"),
      link: { installmentId: paid },
    });
    expect(rateReceipt.id).toBeTruthy();

    const items = await collectReceiptMonth(owner, "2026-10");
    expect(items.map((i) => [i.kind, i.date, i.amountCents, i.receipts.length])).toEqual([
      ["installment", "2026-10-05", 10_000, 1],
      ["expense", "2026-10-06", 6_420, 0],
    ]);
    expect(await collectReceiptMonth(owner, "2026-08")).toEqual([]);
    expect(await collectReceiptMonth(owner, "nope")).toEqual([]);

    const bundle = await buildReceiptBundle(owner, "2026-10", labels);
    expect(bundle).toMatchObject({ payments: 2, files: 1, missing: 1 });
    expect(bundle.entries.map((e) => e.name)).toEqual([
      "belege-2026-10.csv",
      "belege/2026-10-05_100.00.pdf",
    ]);
    expect(bundle.csv.startsWith(`${String.fromCharCode(0xfeff)}Datum;Art;Lieferant`)).toBe(true);
    const lines = bundle.csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "2026-10-05;Rate;;Toiletten Rahmenvertrag;cat:toilets;;100,00;m:bank_transfer;RE-77;belege/2026-10-05_100.00.pdf;nein",
    );
    // Quotes are doubled, formula-looking text is defused, the missing receipt says "ja".
    expect(lines[2]).toBe(
      '2026-10-06;Ausgabe;\'=Tankstelle;"Tanken; mit ""Quote""";cat:transport_fuel;;64,20;;;;ja',
    );

    const files = readZip(await zipBuffer(bundle.entries));
    expect([...files.keys()]).toEqual(["belege-2026-10.csv", "belege/2026-10-05_100.00.pdf"]);
    expect(
      Buffer.from(pdf("rate")).equals(files.get("belege/2026-10-05_100.00.pdf") as Buffer),
    ).toBe(true);
    expect(files.get("belege-2026-10.csv")?.toString("utf8")).toBe(bundle.csv);
    expect(exp.id).toBeTruthy();

    const [entry] = await audits("finance.export_receipts");
    expect(entry?.diff).toMatchObject({ month: "2026-10", payments: 2, files: 1, missing: 1 });
    expect(payableId).toBeTruthy();
  });

  it("includes a payable-level invoice once and names clashes apart", async () => {
    const { payableId } = await seedPayments();
    // Pay the second rate in the same month and amount as the first, so the names would clash.
    const p = await getPayable(owner, payableId, TODAY);
    const second = p?.installments[1];
    if (!second) throw new Error("no rate");
    await markInstallmentPaid(
      owner,
      second.id,
      { paidOn: "2026-10-05", amountCents: 10_000 },
      { today: TODAY },
    );
    await createDocument(owner, {
      fileName: "rahmen.pdf",
      bytes: pdf("frame"),
      link: { payableId },
    });
    const plan = planBundle(await collectReceiptMonth(owner, "2026-10"), labels);
    // One invoice covers both payments: one file, referenced from both CSV rows.
    expect(plan.files).toHaveLength(1);
    expect(plan.missing).toBe(0);
    const rows = plan.csv.trim().split("\r\n").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.includes(plan.files[0]?.path ?? "?"))).toBe(true);

    // A second, different receipt for a rate gets a numbered name.
    const rate = p?.installments[0];
    if (!rate) throw new Error("no rate");
    await createDocument(owner, {
      fileName: "extra.pdf",
      bytes: pdf("extra"),
      link: { installmentId: rate.id },
    });
    const again = planBundle(await collectReceiptMonth(owner, "2026-10"), labels);
    const names = again.files.map((f) => f.path).sort();
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => n.endsWith("_2.pdf"))).toBe(true);
  });

  it("is only for roles that may read finance", async () => {
    for (const actor of [staff, field]) {
      let error: unknown;
      try {
        await collectReceiptMonth(actor, "2026-10");
      } catch (e) {
        error = e;
      }
      expect(isForbidden(error)).toBe(true);
    }
  });
});
