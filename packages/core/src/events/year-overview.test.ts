import { describe, expect, it } from "vitest";
import {
  parseHiddenMarkets,
  SINGLE_EVENTS_KEY,
  toggleHiddenMarket,
  type YearEvent,
  yearDots,
  yearLegend,
  yearLegendKey,
} from "./year-overview";

const ALT = "00000000-0000-4000-8000-000000000001";
const NIP = "00000000-0000-4000-8000-000000000002";
const OLD = "00000000-0000-4000-8000-000000000003";
const NEW = "00000000-0000-4000-8000-000000000004";
const SLEEP = "00000000-0000-4000-8000-000000000005";

const ev = (
  id: string,
  presetId: string | null,
  startsOn: string,
  endsOn = startsOn,
  status = "planned",
  name = id,
): YearEvent => ({ id, presetId, name, startsOn, endsOn, status });

describe("yearDots", () => {
  it("puts one dot per event and day, with the day's index for longer events", () => {
    const altstadt = ev("altstadt", ALT, "2027-03-27", "2027-03-29");
    const dots = yearDots([altstadt], 2027);
    expect([...dots.keys()]).toEqual(["2027-03-27", "2027-03-28", "2027-03-29"]);
    expect(dots.get("2027-03-28")).toEqual([{ event: altstadt, index: 2, total: 3 }]);
  });

  it("clips events at the year's edges (New Year in both years) and across DST", () => {
    const newYear = ev("silvester", NIP, "2026-12-31", "2027-01-02");
    expect([...yearDots([newYear], 2027).keys()]).toEqual(["2027-01-01", "2027-01-02"]);
    expect(yearDots([newYear], 2027).get("2027-01-01")?.[0]).toMatchObject({ index: 2, total: 3 });
    expect([...yearDots([newYear], 2026).keys()]).toEqual(["2026-12-31"]);
    expect(yearDots([newYear], 2028).size).toBe(0);
    // The night the clocks go forward (28 March 2027) is still one calendar day.
    const dst = ev("dst", ALT, "2027-03-27", "2027-03-28");
    expect([...yearDots([dst], 2027).keys()]).toEqual(["2027-03-27", "2027-03-28"]);
  });

  it("orders a day's dots by start, then name, then id, whatever the input order", () => {
    const longer = ev("a-long", ALT, "2027-05-14", "2027-05-16", "planned", "Zülpicher");
    const b = ev("b", NIP, "2027-05-15", "2027-05-15", "planned", "Nippes");
    const a = ev("a", OLD, "2027-05-15", "2027-05-15", "planned", "Nippes");
    const c = ev("c", null, "2027-05-15", "2027-05-15", "planned", "Altstadt");
    const ids = (events: YearEvent[]) =>
      yearDots(events, 2027)
        .get("2027-05-15")
        ?.map((d) => d.event.id);
    expect(ids([b, c, a, longer])).toEqual(["a-long", "c", "a", "b"]);
    expect(ids([longer, a, b, c])).toEqual(["a-long", "c", "a", "b"]);
  });

  it("keeps cancelled events (shown struck through) and skips broken ranges", () => {
    const cancelled = ev("x", ALT, "2027-06-06", "2027-06-06", "cancelled");
    expect(yearDots([cancelled], 2027).get("2027-06-06")).toHaveLength(1);
    expect(yearDots([ev("bad", ALT, "2027-06-07", "2027-06-06")], 2027).size).toBe(0);
  });
});

describe("yearLegend", () => {
  const markets = [
    { id: NIP, name: "Nippes", active: true },
    { id: ALT, name: "Altstadt", active: true },
    { id: NEW, name: "Südbrücke", active: true },
    { id: SLEEP, name: "Ruhender Markt", active: false },
  ];

  it("lists every active market in name order, also without dates, with its count", () => {
    const events = [
      ev("n1", NIP, "2027-01-17"),
      ev("n2", NIP, "2027-02-21"),
      ev("n3", NIP, "2027-03-21", "2027-03-21", "cancelled"),
      ev("a1", ALT, "2027-03-27", "2027-03-29"),
    ];
    const legend = yearLegend(markets, events);
    expect(legend.map((e) => [e.name, e.count])).toEqual([
      ["Altstadt", 1],
      ["Nippes", 2], // the cancelled one is not counted
      ["Südbrücke", 0],
    ]);
    expect(legend[1]?.sample?.id).toBe("n1");
    expect(legend[2]?.sample).toBeNull();
  });

  it("adds inactive and archived markets only when they have dates; Einzeltermine last", () => {
    const events = [
      ev("s1", SLEEP, "2027-04-04"),
      ev("o2", OLD, "2027-09-12", "2027-09-12", "planned", "Hoffnungsthal"),
      ev("o1", OLD, "2027-05-02", "2027-05-02", "planned", "Hoffnungsthal 2027"),
      ev("e1", null, "2027-07-04", "2027-07-04", "planned", "CSD"),
      ev("e2", null, "2027-07-05", "2027-07-05", "cancelled", "CSD 2"),
    ];
    const legend = yearLegend(markets, events);
    expect(legend.map((e) => e.key)).toEqual([ALT, OLD, NIP, SLEEP, NEW, SINGLE_EVENTS_KEY]);
    const archived = legend.find((e) => e.key === OLD);
    // An archived market is named after its first event.
    expect(archived).toMatchObject({ market: null, name: "Hoffnungsthal 2027", count: 2 });
    expect(legend.at(-1)).toMatchObject({ market: null, name: "", count: 1 });
    expect(legend.at(-1)?.sample?.id).toBe("e1");
  });

  it("can leave markets without dates out (narrowed views)", () => {
    const legend = yearLegend(markets, [ev("a1", ALT, "2027-03-27")], { includeEmpty: false });
    expect(legend.map((e) => e.name)).toEqual(["Altstadt"]);
    expect(yearLegend(markets, [], { includeEmpty: false })).toEqual([]);
  });
});

describe("hidden markets in the URL", () => {
  it("keeps preset ids and the Einzeltermine key, sorted and without duplicates", () => {
    expect(parseHiddenMarkets(undefined)).toEqual([]);
    expect(parseHiddenMarkets("")).toEqual([]);
    expect(
      parseHiddenMarkets(`${NIP},einzel,${ALT},${NIP},nonsense, ${OLD.toUpperCase()}`),
    ).toEqual([ALT, NIP, OLD, SINGLE_EVENTS_KEY]);
    expect(parseHiddenMarkets([ALT, `${NIP},x`])).toEqual([ALT, NIP]);
  });

  it("toggles one market and drops the parameter when nothing stays hidden", () => {
    expect(toggleHiddenMarket([], NIP)).toBe(NIP);
    expect(toggleHiddenMarket([NIP], ALT)).toBe(`${ALT},${NIP}`);
    expect(toggleHiddenMarket([ALT, NIP], ALT)).toBe(NIP);
    expect(toggleHiddenMarket([NIP], NIP)).toBeUndefined();
    expect(toggleHiddenMarket([], SINGLE_EVENTS_KEY)).toBe(SINGLE_EVENTS_KEY);
  });

  it("keys events by market, Einzeltermine by the shared key", () => {
    expect(yearLegendKey({ presetId: ALT })).toBe(ALT);
    expect(yearLegendKey({ presetId: null })).toBe(SINGLE_EVENTS_KEY);
  });
});
