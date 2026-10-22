// No "use client" here: server pages import these values, and values exported from a client module
// would arrive as client references instead.

export type VenueFormValues = {
  name: string;
  kind: string;
  street: string | null;
  postalCode: string | null;
  city: string;
  bundesland: string;
  accessInfo: string | null;
  landownerContactId: string | null;
  capacityCm: number | null;
  lat: number | null;
  lng: number | null;
};

/** A new venue starts as a public outdoor place in Nordrhein-Westfalen (the company's home state). */
export const EMPTY_VENUE: VenueFormValues = {
  name: "",
  kind: "outdoor_public",
  street: null,
  postalCode: null,
  city: "",
  bundesland: "NW",
  accessInfo: null,
  landownerContactId: null,
  capacityCm: null,
  lat: null,
  lng: null,
};
