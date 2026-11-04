import { initialLetter } from "@marktwerk/core/text/letter";
import { vendor } from "@marktwerk/db/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listVendorLetters, listVendors } from "@/server/queries/vendors";
import { resetDatabase } from "../helpers/fixtures";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await db.$client.end();
});

const names = [
  "Müller Antik",
  "Ärztehaus Trödel",
  "äpfel & birnen",
  "Östlich",
  "Élan Vintage",
  "  Bauer",
  '"Zum Löwen"',
  "„Kunst“ GmbH",
  "(Dr.) Hahn",
  "4 Jahreszeiten",
  "& Co",
  "Øresund",
  "ßtrand",
  "Anna",
];

async function seed(extra: Partial<typeof vendor.$inferInsert> = {}, list = names) {
  await db.insert(vendor).values(
    list.map((displayName, i) => ({
      kind: "private" as const,
      displayName,
      legacyId: i + 1,
      ...extra,
    })),
  );
}

describe("vendor A–Z selector (CF9-7)", () => {
  it("files names under the same letter as core's initialLetter", async () => {
    await seed();
    const letters = new Set(names.map(initialLetter));
    for (const letter of letters) {
      const { rows } = await listVendors({ letter }, 1);
      expect(rows.map((r) => r.displayName).sort(), letter).toEqual(
        names.filter((n) => initialLetter(n) === letter).sort(),
      );
    }
    expect(await listVendorLetters({})).toEqual(
      [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"].filter((l) =>
        letters.has(l as ReturnType<typeof initialLetter>),
      ),
    );
  });

  it("pages and counts within the letter", async () => {
    await seed(
      {},
      Array.from({ length: 55 }, (_, i) => `Anton ${String(i).padStart(2, "0")}`),
    );
    await db.insert(vendor).values({ kind: "private", displayName: "Berta", legacyId: 999 });
    const first = await listVendors({ letter: "A" }, 1);
    expect(first.total).toBe(55);
    expect(first.rows).toHaveLength(50);
    expect((await listVendors({ letter: "A" }, 2)).rows).toHaveLength(5);
    expect((await listVendors({ letter: "B" }, 1)).total).toBe(1);
  });

  it("combines with the other filters; available letters ignore the letter only", async () => {
    await db.insert(vendor).values([
      { kind: "private", displayName: "Anna", legacyId: 1, isRegular: true, categories: ["antik"] },
      { kind: "private", displayName: "Bert", legacyId: 2, isRegular: true, categories: ["food"] },
      {
        kind: "private",
        displayName: "Carla",
        legacyId: 3,
        isRegular: false,
        categories: ["antik"],
      },
    ]);
    expect(await listVendorLetters({ regular: true })).toEqual(["A", "B"]);
    expect(await listVendorLetters({ category: "antik" })).toEqual(["A", "C"]);
    expect(await listVendorLetters({ category: "antik", letter: "B" })).toEqual(["A", "C"]);
    const { rows, total } = await listVendors({ regular: true, category: "antik", letter: "A" }, 1);
    expect(total).toBe(1);
    expect(rows[0]?.displayName).toBe("Anna");
    expect((await listVendors({ regular: true, letter: "C" }, 1)).total).toBe(0);
  });
});
