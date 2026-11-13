import { describe, expect, it } from "vitest";
import { filterPickerOptions, pickerQuery } from "./picker";

const options = [
  { id: "1", label: "Stadt Düsseldorf", hint: "Düsseldorf" },
  { id: "2", label: "Köln Messe GmbH", hint: "Köln" },
  { id: "3", label: "Gut Römerhof", hint: "Köln" },
  { id: "4", label: "Straßenbauamt", hint: null },
  { id: "5", label: "Kölner Grund AG" },
];

const ids = (query: string) => filterPickerOptions(options, query).map((o) => o.id);

describe("filterPickerOptions", () => {
  it("returns every option, in order, for an empty query", () => {
    expect(ids("")).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids("   ")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("ignores case, umlauts and ß", () => {
    expect(ids("duesseldorf")).toEqual(["1"]);
    expect(ids("DUSSELDORF")).toEqual(["1"]);
    expect(ids("roemer")).toEqual(["3"]);
    expect(ids("strasse")).toEqual(["4"]);
  });

  it("searches the hint and needs every word somewhere", () => {
    expect(ids("römerhof köln")).toEqual(["3"]);
    expect(ids("gmbh köln")).toEqual(["2"]);
    expect(ids("köln bonn")).toEqual([]);
  });

  it("puts labels that start with the query first, else keeps the order", () => {
    // "Gut Römerhof" only matches via its hint; both labels starting with "Köln" come first.
    expect(ids("koln")).toEqual(["2", "5", "3"]);
  });

  it("does not change the input array", () => {
    const copy = [...options];
    filterPickerOptions(options, "köln");
    expect(options).toEqual(copy);
  });
});

describe("pickerQuery", () => {
  it("is empty while the input shows the selected label", () => {
    expect(pickerQuery("Gut Römerhof", "Gut Römerhof")).toBe("");
    expect(pickerQuery(" Gut Römerhof ", "Gut Römerhof")).toBe("");
  });

  it("is the trimmed input once something else is typed", () => {
    expect(pickerQuery("Gut R", "Gut Römerhof")).toBe("Gut R");
    expect(pickerQuery("  neu ", null)).toBe("neu");
    expect(pickerQuery("", null)).toBe("");
  });
});
