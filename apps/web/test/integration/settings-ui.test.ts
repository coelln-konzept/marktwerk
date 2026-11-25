import { describe, expect, it } from "vitest";
import { filterMarkets } from "@/components/settings/library-search";
import { guardedTarget } from "@/components/settings/unsaved-target";

const market = (
  name: string,
  extra: Partial<Parameters<typeof filterMarkets>[0][number]> = {},
) => ({
  name,
  code: "",
  venueName: "Rheinufer",
  typeNameDe: "Flohmarkt",
  typeNameEn: "Flea market",
  publicTitle: null,
  ...extra,
});

describe("filterMarkets (Einstellungen → Bibliothek search)", () => {
  const markets = [
    market("Altstadt Lifestyle", { code: "ALS", venueName: "Heumarkt" }),
    market("Antikmarkt Köln", { typeNameDe: "Antikmarkt", typeNameEn: "Antiques market" }),
    market("Südstadt Flohmarkt", { publicTitle: "Trödel am Chlodwigplatz" }),
  ];

  it("keeps everything for an empty or blank query", () => {
    expect(filterMarkets(markets, undefined)).toHaveLength(3);
    expect(filterMarkets(markets, "   ")).toHaveLength(3);
  });

  it("matches name, Kürzel, Ort, Art and public title, ignoring case", () => {
    expect(filterMarkets(markets, "lifestyle").map((m) => m.name)).toEqual(["Altstadt Lifestyle"]);
    expect(filterMarkets(markets, "als").map((m) => m.name)).toEqual(["Altstadt Lifestyle"]);
    expect(filterMarkets(markets, "HEUMARKT").map((m) => m.name)).toEqual(["Altstadt Lifestyle"]);
    expect(filterMarkets(markets, "antik").map((m) => m.name)).toEqual(["Antikmarkt Köln"]);
    expect(filterMarkets(markets, "chlodwig").map((m) => m.name)).toEqual(["Südstadt Flohmarkt"]);
  });

  it("ignores accents both ways", () => {
    expect(filterMarkets(markets, "koln").map((m) => m.name)).toEqual(["Antikmarkt Köln"]);
    expect(filterMarkets(markets, "südstadt").map((m) => m.name)).toEqual(["Südstadt Flohmarkt"]);
    expect(filterMarkets(markets, "sudstadt").map((m) => m.name)).toEqual(["Südstadt Flohmarkt"]);
  });

  it("needs every word to match", () => {
    expect(filterMarkets(markets, "flohmarkt rheinufer").map((m) => m.name)).toEqual([
      "Südstadt Flohmarkt",
    ]);
    expect(filterMarkets(markets, "altstadt rheinufer")).toEqual([]);
  });
});

describe("guardedTarget (unsaved-changes guard on the Firma form)", () => {
  const here = { origin: "https://app.test", pathname: "/einstellungen/firma", search: "" };
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const link = (href: string, attrs: { target?: string; download?: boolean } = {}) => ({
    href: new URL(href, "https://app.test/einstellungen/firma").href,
    target: attrs.target ?? "",
    hasAttribute: (name: string) => name === "download" && attrs.download === true,
  });

  it("holds a plain click on another in-app page (tabs, sidebar)", () => {
    expect(guardedTarget(link("/einstellungen/bibliothek"), click, here)).toBe(
      "/einstellungen/bibliothek",
    );
    expect(guardedTarget(link("/veranstaltungen?ansicht=liste#x"), click, here)).toBe(
      "/veranstaltungen?ansicht=liste#x",
    );
  });

  it("lets new tabs, downloads, other sites and same-page anchors through", () => {
    expect(guardedTarget(link("/kalender"), { ...click, metaKey: true }, here)).toBeNull();
    expect(guardedTarget(link("/kalender"), { ...click, ctrlKey: true }, here)).toBeNull();
    expect(guardedTarget(link("/kalender"), { ...click, button: 1 }, here)).toBeNull();
    expect(guardedTarget(link("/kalender", { target: "_blank" }), click, here)).toBeNull();
    expect(guardedTarget(link("/export.csv", { download: true }), click, here)).toBeNull();
    expect(guardedTarget(link("https://example.org/"), click, here)).toBeNull();
    expect(guardedTarget(link("/einstellungen/firma#bank"), click, here)).toBeNull();
  });
});
