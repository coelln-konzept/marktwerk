import { app } from "./_schema";

/** Own module so templates.ts can use it without importing permits.ts (which imports templates.ts). */
export const permitType = app.enum("permit_type", [
  "market_permit",
  "water",
  "signage",
  "no_parking",
  "toilets",
  "landowner_ok",
  "gema",
  "safety_concept",
  "traffic_order",
  "catering",
  "insurance",
  "other",
]);
