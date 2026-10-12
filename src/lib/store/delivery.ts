import { z } from "zod";

/** Delivery options (store.delivery_zones): rules shared by the dashboard, checkout and tests. */

export type DeliveryZone = {
  id: string;
  name: string;
  regions: string[];
  fee: number;
  freeOver: number | null;
  etaText: string | null;
  isPickup: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type DeliveryZoneRow = {
  id: string;
  name: string;
  regions: string[] | null;
  fee: number | string;
  free_over: number | string | null;
  eta_text: string | null;
  is_pickup: boolean;
  is_active: boolean;
  sort_order: number;
};

export function mapDeliveryZone(row: DeliveryZoneRow): DeliveryZone {
  return {
    id: row.id,
    name: row.name,
    regions: row.regions ?? [],
    fee: Number(row.fee) || 0,
    freeOver: row.free_over == null ? null : Number(row.free_over),
    etaText: row.eta_text,
    isPickup: row.is_pickup,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

/** "Lagos State" and "lagos" are the same place. */
export const placeKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s+(state|region|province|county)$/, "");

/** Areas shops write to mean "anywhere I haven't listed", e.g. "Other states". */
const EVERYWHERE_ELSE = new Set(["everywhere", "everywhere else", "other states", "other areas", "other locations", "rest of the country", "nationwide", "anywhere", "all states", "*"]);

export const isEverywhereArea = (area: string) => EVERYWHERE_ELSE.has(placeKey(area).replace(/[^a-z* ]/g, "").trim());

/** A place as its words: "Abuja (FCT)" → ["abuja", "fct"]. */
const placeWords = (s: string) => placeKey(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/** Whole words of one inside the other: "Lagos" matches "Lagos Island", "FCT" matches "Abuja (FCT)". */
function placesMatch(area: string, place: string) {
  const a = placeWords(area);
  const p = placeWords(place);
  if (!a.length || !p.length) return false;
  const contains = (outer: string[], inner: string[]) => outer.some((_, i) => inner.every((w, j) => outer[i + j] === w));
  return contains(a, p) || contains(p, a);
}

/**
 * Whether an option delivers to this address. An option with no areas, or
 * with an "everywhere else" area, goes everywhere; collection needs no
 * address. Otherwise the shopper's state or town must match one of the
 * option's areas, word for word but forgivingly ("Lagos" covers "Lagos Island").
 */
export function zoneCovers(zone: Pick<DeliveryZone, "regions" | "isPickup">, address: { state?: string | null; city?: string | null }) {
  if (zone.isPickup || zone.regions.length === 0 || zone.regions.some(isEverywhereArea)) return true;
  const where = [address.state, address.city].filter((p): p is string => Boolean(p && p.trim()));
  if (!where.length) return false;
  return zone.regions.some((r) => where.some((place) => placesMatch(r, place)));
}

/** What the shopper pays for an option on an order of this subtotal. */
export function deliveryFeeFor(zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup">, subtotal: number) {
  if (zone.isPickup) return 0;
  if (zone.freeOver != null && subtotal >= zone.freeOver) return 0;
  return zone.fee;
}

/**
 * The full delivery charge: the area's fee (waived over its free-delivery
 * amount) plus each product's own extra charge per item. Collection is free.
 */
export function deliveryChargeFor(
  zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup">,
  subtotal: number,
  lines: Array<{ deliveryExtra?: number | null; quantity: number }>,
) {
  if (zone.isPickup) return 0;
  const extras = lines.reduce((sum, l) => sum + (Number(l.deliveryExtra) || 0) * l.quantity, 0);
  return Math.round((deliveryFeeFor(zone, subtotal) + extras) * 100) / 100;
}

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(2, "Give the option a name customers will understand.").max(80),
  // States and towns the option covers; empty means everywhere. Duplicates are dropped.
  regions: z
    .array(z.string().trim().min(1).max(80))
    .max(120, "That's more areas than one option can hold. Leave them all out to deliver everywhere.")
    .transform((list) => list.filter((r, i) => list.findIndex((x) => placeKey(x) === placeKey(r)) === i)),
  fee: z.coerce.number().min(0, "The charge can't be negative.").max(100_000_000),
  freeOver: z.coerce.number().positive("Enter an amount above zero, or leave it blank.").max(100_000_000).nullable(),
  etaText: z.string().trim().max(80).nullable(),
  isPickup: z.boolean(),
  isActive: z.boolean(),
});

export type DeliveryZoneInput = z.infer<typeof deliveryZoneSchema>;

export function toDeliveryZoneRow(input: DeliveryZoneInput) {
  return {
    name: input.name,
    regions: input.regions,
    fee: input.isPickup ? 0 : input.fee,
    free_over: input.isPickup ? null : input.freeOver,
    eta_text: input.etaText || null,
    is_pickup: input.isPickup,
    is_active: input.isActive,
  };
}
