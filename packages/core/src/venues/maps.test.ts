import { describe, expect, it } from "vitest";
import { mapsQuery, mapsRouteUrl, mapsSearchUrl } from "./maps";

describe("maps links", () => {
  it("prefers the coordinates", () => {
    const place = {
      street: "Roncalliplatz",
      postalCode: "50667",
      city: "Köln",
      lat: 50.9413,
      lng: 6.9583,
    };
    expect(mapsQuery(place)).toBe("50.9413,6.9583");
    expect(mapsSearchUrl(place)).toBe(
      "https://www.google.com/maps/search/?api=1&query=50.9413%2C6.9583",
    );
    expect(mapsRouteUrl(place)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=50.9413%2C6.9583",
    );
  });

  it("falls back to the address", () => {
    expect(mapsQuery({ street: "Roncalliplatz", postalCode: "50667", city: "Köln" })).toBe(
      "Roncalliplatz, 50667 Köln",
    );
    expect(mapsQuery({ city: "Rösrath" })).toBe("Rösrath");
    expect(mapsSearchUrl({ city: "Köln" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=K%C3%B6ln",
    );
  });

  it("gives nothing without a town or coordinates", () => {
    expect(mapsQuery({ street: "Hauptstraße 1" })).toBeNull();
    expect(mapsSearchUrl({})).toBeNull();
    expect(mapsRouteUrl({ lat: 50, lng: null })).toBeNull();
  });
});
