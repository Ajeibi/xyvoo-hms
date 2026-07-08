/** Shared deterministic UUID helpers for guest + order fixtures. */

const GUEST_FIXTURE_NS = "f1000001-0000-4000-8000";
const ORDER_FIXTURE_NS = "f2000001-0000-4000-8000";

export function fixtureNumericKey(ref: string): number {
  const n = Number(ref.replace(/\D/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid fixture ref: ${ref}`);
  return n;
}

export function reservationIdFromStayRef(ref: string): string {
  const key = fixtureNumericKey(ref);
  return `${GUEST_FIXTURE_NS.slice(0, 8)}-0002-4000-8000-${String(key).padStart(12, "0")}`;
}

export function orderFixtureUuid(kind: "order" | "item" | "folio", key: number): string {
  const prefix = kind === "order" ? "0001" : kind === "item" ? "0002" : "0003";
  return `${ORDER_FIXTURE_NS.slice(0, 8)}-${prefix}-4000-8000-${String(key).padStart(12, "0")}`;
}

/** Common menu name typos / aliases → Pope catalog names. */
export const MENU_ITEM_ALIASES: Record<string, string> = {
  Pancake: "Pancakes",
  "Beef Kebeb": "Beef",
  "Sprite (Big)": "Sprite (50cl)",
  Star: "Star Radler",
  Burger: "Sandwich",
  "Sharwama Small": "Sandwich",
  Gizzard: "Chicken",
};
