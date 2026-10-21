import type { DutyRoleKey } from "../types";

export interface DutyRoleBlueprint {
  key: DutyRoleKey;
  nameDe: string;
  nameEn: string;
}

/** Seed list from docs/product/roles-and-personas.md. Order is the display order. */
export const DUTY_ROLE_BLUEPRINTS: readonly DutyRoleBlueprint[] = [
  { key: "market_lead", nameDe: "Marktleitung", nameEn: "Market lead" },
  { key: "setup_crew", nameDe: "Aufbau/Logistik", nameEn: "Set-up & logistics" },
  { key: "office", nameDe: "Büro/Buchungen", nameEn: "Office & bookings" },
  { key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" },
  { key: "communication", nameDe: "Kommunikation", nameEn: "Communication" },
  { key: "cash", nameDe: "Kasse", nameEn: "Cash" },
  { key: "water_power", nameDe: "Wasser/Strom", nameEn: "Water & power" },
];
