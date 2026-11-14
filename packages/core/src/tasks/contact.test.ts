import { describe, expect, it } from "vitest";
import {
  type ContactContext,
  contactForRole,
  isTaskContactRole,
  NO_CONTACT_CONTEXT,
  suggestTaskContact,
} from "./contact";

const city: ContactContext = {
  venueOwner: { id: "stadt", kind: "authority" },
  requirements: [
    { permitType: "market_permit", authorityId: "ordnungsamt" },
    { permitType: "traffic_order", authorityId: "strassenverkehr" },
    { permitType: "gema", authorityId: null },
  ],
};

const privateGround: ContactContext = {
  venueOwner: { id: "eigentuemer", kind: "landowner" },
  requirements: [{ permitType: "landowner_ok", authorityId: null }],
};

describe("isTaskContactRole", () => {
  it("knows Behörde and Eigentümer only", () => {
    expect(isTaskContactRole("authority")).toBe(true);
    expect(isTaskContactRole("landowner")).toBe(true);
    expect(isTaskContactRole("supplier")).toBe(false);
    expect(isTaskContactRole(null)).toBe(false);
  });
});

describe("contactForRole", () => {
  it("Eigentümer is the Ort's owner, whatever its kind", () => {
    expect(contactForRole("landowner", city)).toBe("stadt");
    expect(contactForRole("landowner", privateGround)).toBe("eigentuemer");
    expect(contactForRole("landowner", NO_CONTACT_CONTEXT)).toBeNull();
  });

  it("Behörde with a permit type is the authority of that requirement", () => {
    expect(contactForRole("authority", city, "market_permit")).toBe("ordnungsamt");
    expect(contactForRole("authority", city, "traffic_order")).toBe("strassenverkehr");
  });

  it("a requirement without an authority falls back to an owner that is a Behörde, never to another permit's", () => {
    expect(contactForRole("authority", city, "gema")).toBe("stadt");
    expect(
      contactForRole(
        "authority",
        { ...city, venueOwner: { id: "privat", kind: "landowner" } },
        "gema",
      ),
    ).toBeNull();
  });

  it("the Marktgenehmigung stands for the owner's OK on private ground", () => {
    const withAuthority: ContactContext = {
      venueOwner: { id: "eigentuemer", kind: "landowner" },
      requirements: [{ permitType: "landowner_ok", authorityId: "verwalter" }],
    };
    expect(contactForRole("authority", withAuthority, "market_permit")).toBe("verwalter");
  });

  it("without a permit type: the one authority all requirements name", () => {
    const one: ContactContext = {
      venueOwner: null,
      requirements: [
        { permitType: "market_permit", authorityId: "ordnungsamt" },
        { permitType: "fixing", authorityId: "ordnungsamt" },
        { permitType: "gema", authorityId: null },
      ],
    };
    expect(contactForRole("authority", one)).toBe("ordnungsamt");
  });

  it("never guesses between two authorities: then the owner if a Behörde, else none", () => {
    expect(contactForRole("authority", city)).toBe("stadt");
    expect(
      contactForRole("authority", { ...city, venueOwner: { id: "p", kind: "landowner" } }),
    ).toBeNull();
  });

  it("an unknown permit type at the Ort works like no permit type", () => {
    const one: ContactContext = {
      venueOwner: null,
      requirements: [{ permitType: "market_permit", authorityId: "ordnungsamt" }],
    };
    expect(contactForRole("authority", one, "water_pipe")).toBe("ordnungsamt");
  });

  it("an event-type-specific requirement wins (it comes first)", () => {
    const both: ContactContext = {
      venueOwner: null,
      requirements: [
        { permitType: "market_permit", authorityId: "special" },
        { permitType: "market_permit", authorityId: "general" },
      ],
    };
    expect(contactForRole("authority", both, "market_permit")).toBe("special");
  });
});

describe("suggestTaskContact", () => {
  const base = {
    category: "general",
    permitType: null,
    permitAuthorityId: null,
    role: null,
    context: city,
  } as const;

  it("a task of a permit suggests the permit's Behörde first", () => {
    expect(suggestTaskContact({ ...base, permitAuthorityId: "amt", category: "permits" })).toEqual({
      contactId: "amt",
      reason: "permit",
    });
    // even without an Ort (a permit's own task)
    expect(suggestTaskContact({ ...base, permitAuthorityId: "amt", context: null })).toEqual({
      contactId: "amt",
      reason: "permit",
    });
  });

  it("a permit task without a linked permit asks the Ort's Behörde", () => {
    expect(suggestTaskContact({ ...base, permitType: "traffic_order" })).toEqual({
      contactId: "strassenverkehr",
      reason: "authority",
    });
    expect(suggestTaskContact({ ...base, category: "permits" })).toEqual({
      contactId: "stadt",
      reason: "landowner",
    });
  });

  it("on private ground a permit task suggests the owner (the owner's OK is the permit)", () => {
    expect(
      suggestTaskContact({
        ...base,
        category: "permits",
        permitType: "market_permit",
        context: privateGround,
      }),
    ).toEqual({ contactId: "eigentuemer", reason: "landowner" });
  });

  it("a Logistik task suggests the Ort's owner", () => {
    expect(suggestTaskContact({ ...base, category: "logistics", context: privateGround })).toEqual({
      contactId: "eigentuemer",
      reason: "landowner",
    });
  });

  it("other categories get no suggestion, nor tasks without an Ort", () => {
    expect(suggestTaskContact({ ...base, category: "communication" })).toBeNull();
    expect(suggestTaskContact({ ...base, category: "permits", context: null })).toBeNull();
    expect(
      suggestTaskContact({ ...base, category: "logistics", context: NO_CONTACT_CONTEXT }),
    ).toBeNull();
  });

  it("the template item's role counts, also in a category that would suggest nothing", () => {
    expect(
      suggestTaskContact({
        ...base,
        category: "communication",
        role: "landowner",
        context: privateGround,
      }),
    ).toEqual({ contactId: "eigentuemer", reason: "landowner" });
    expect(
      suggestTaskContact({
        ...base,
        category: "office",
        role: "authority",
        permitType: "market_permit",
      }),
    ).toEqual({ contactId: "ordnungsamt", reason: "authority" });
  });

  it("a role that finds nobody falls back to the category rules", () => {
    expect(
      suggestTaskContact({
        ...base,
        category: "logistics",
        role: "authority",
        context: privateGround,
      }),
    ).toEqual({ contactId: "eigentuemer", reason: "landowner" });
  });
});
