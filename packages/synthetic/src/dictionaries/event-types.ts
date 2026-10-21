import type { EventTypeKey, EventTypeRules } from "../types";

export interface EventTypeBlueprint {
  key: EventTypeKey;
  nameDe: string;
  nameEn: string;
  colour: string;
  rules: EventTypeRules;
}

/** The four event types in scope for 2026/2027. Other formats are data for later. */
export const EVENT_TYPE_BLUEPRINTS: readonly EventTypeBlueprint[] = [
  {
    key: "flea",
    nameDe: "Flohmarkt",
    nameEn: "Flea market",
    colour: "#2F6F4E",
    rules: {
      newGoodsMaxShare: 0.3,
      bannedGoods: ["Batterien", "Handyhüllen"],
      onlineBookingAllowed: true,
      defaultPricePerMCents: 1500,
      defaultBookingFeeCents: 250,
      vendorContractModel: "per_event",
    },
  },
  {
    key: "antique",
    nameDe: "Antikmarkt",
    nameEn: "Antique market",
    colour: "#7A4E2D",
    rules: {
      newGoodsMaxShare: 0,
      bannedGoods: ["Neuware"],
      onlineBookingAllowed: true,
      defaultPricePerMCents: 2000,
      defaultBookingFeeCents: 250,
      vendorContractModel: "per_event",
    },
  },
  {
    key: "city_festival",
    nameDe: "Stadtfest",
    nameEn: "City festival",
    colour: "#B5452B",
    rules: {
      newGoodsMaxShare: 0.5,
      bannedGoods: ["Batterien"],
      onlineBookingAllowed: false,
      defaultPricePerMCents: null,
      defaultBookingFeeCents: null,
      vendorContractModel: "per_event",
    },
  },
  {
    key: "food_wine",
    nameDe: "Food & Wine",
    nameEn: "Food & wine market",
    colour: "#6B2D5C",
    rules: {
      newGoodsMaxShare: 1,
      bannedGoods: [],
      onlineBookingAllowed: false,
      defaultPricePerMCents: null,
      defaultBookingFeeCents: null,
      vendorContractModel: "yearly_contract",
    },
  },
];
