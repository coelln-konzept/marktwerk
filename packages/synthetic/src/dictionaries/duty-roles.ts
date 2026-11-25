import type { DutyRoleKey } from "../types";

export interface DutyRoleBlueprint {
  key: DutyRoleKey;
  nameDe: string;
  nameEn: string;
}

/**
 * Seed list from docs/product/roles-and-personas.md, plus the market-day roles of the client's sheets (research 13
 * §1.5, §4): Einweisung, Tageswache „Ordner“, Nachtwache and Verkehr (Verkehr regeln, Abflattern,
 * Verkehrssicherung). Nachkassieren stays on Kasse. Order is the display order.
 */
export const DUTY_ROLE_BLUEPRINTS: readonly DutyRoleBlueprint[] = [
  { key: "market_lead", nameDe: "Marktleitung", nameEn: "Market lead" },
  { key: "setup_crew", nameDe: "Aufbau/Logistik", nameEn: "Set-up & logistics" },
  { key: "office", nameDe: "Büro/Buchungen", nameEn: "Office & bookings" },
  { key: "permits", nameDe: "Genehmigungen", nameEn: "Permits" },
  { key: "communication", nameDe: "Kommunikation", nameEn: "Communication" },
  { key: "cash", nameDe: "Kasse", nameEn: "Cash" },
  { key: "water_power", nameDe: "Wasser/Strom", nameEn: "Water & power" },
  { key: "briefing", nameDe: "Einweisung", nameEn: "Vendor briefing" },
  { key: "steward", nameDe: "Tageswache (Ordner)", nameEn: "Day steward" },
  { key: "night_watch", nameDe: "Nachtwache", nameEn: "Night watch" },
  { key: "traffic", nameDe: "Verkehr", nameEn: "Traffic" },
];
