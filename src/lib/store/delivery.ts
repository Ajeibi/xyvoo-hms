import { z } from "zod";

/** Delivery options (store.delivery_zones): rules shared by the dashboard, checkout and tests. */

/** One step of a delivery price by weight: orders up to this weight cost this much. No upper weight means "anything heavier". */
export type WeightBand = { upToKg: number | null; fee: number };

export type DeliveryZone = {
  id: string;
  name: string;
  regions: string[];
  fee: number;
  /** Empty for one charge per order; otherwise the charge depends on the order's weight. */
  weightBands: WeightBand[];
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
  weight_bands?: unknown;
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
    weightBands: parseWeightBands(row.weight_bands),
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

/** Saved bands, tidied: sorted lightest first, anything unreadable dropped. */
export function parseWeightBands(raw: unknown): WeightBand[] {
  if (!Array.isArray(raw)) return [];
  const bands = raw
    .map((b): WeightBand | null => {
      if (!b || typeof b !== "object") return null;
      const { upToKg, fee } = b as Record<string, unknown>;
      const limit = upToKg == null || upToKg === "" ? null : Number(upToKg);
      const charge = Number(fee);
      if ((limit !== null && !(Number.isFinite(limit) && limit > 0)) || !Number.isFinite(charge) || charge < 0) return null;
      return { upToKg: limit, fee: charge };
    })
    .filter((b): b is WeightBand => b !== null);
  return bands.sort((a, b) => (a.upToKg ?? Infinity) - (b.upToKg ?? Infinity));
}

/** The charge for an order of this weight, or null when it is heavier than every band. */
export function weightBandFee(bands: WeightBand[], weightKg: number) {
  const kg = Math.max(Number(weightKg) || 0, 0);
  const band = bands.find((b) => b.upToKg === null || kg <= b.upToKg + 1e-9);
  return band ? band.fee : null;
}

/** Whether an option can carry an order of this weight (always, unless it prices by weight and the order is heavier than its top band). */
export function fitsWeight(zone: Pick<DeliveryZone, "weightBands" | "isPickup">, weightKg: number) {
  return zone.isPickup || zone.weightBands.length === 0 || weightBandFee(zone.weightBands, weightKg) !== null;
}

/** The total weight of an order's lines; items with no weight count as nothing. */
export const orderWeightKg = (lines: Array<{ weightKg?: number | null; quantity: number }>) =>
  Math.round(lines.reduce((sum, l) => sum + (Number(l.weightKg) || 0) * l.quantity, 0) * 1000) / 1000;

/** What the shopper pays for an option on an order of this subtotal and weight. */
export function deliveryFeeFor(zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup"> & { weightBands?: WeightBand[] }, subtotal: number, weightKg = 0) {
  if (zone.isPickup) return 0;
  if (zone.freeOver != null && subtotal >= zone.freeOver) return 0;
  if (zone.weightBands?.length) return weightBandFee(zone.weightBands, weightKg) ?? zone.fee;
  return zone.fee;
}

/**
 * The full delivery charge: the area's fee (waived over its free-delivery
 * amount) plus each product's own extra charge per item. Collection is free.
 */
export function deliveryChargeFor(
  zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup"> & { weightBands?: WeightBand[] },
  subtotal: number,
  lines: Array<{ deliveryExtra?: number | null; weightKg?: number | null; quantity: number }>,
) {
  if (zone.isPickup) return 0;
  const extras = lines.reduce((sum, l) => sum + (Number(l.deliveryExtra) || 0) * l.quantity, 0);
  return Math.round((deliveryFeeFor(zone, subtotal, orderWeightKg(lines)) + extras) * 100) / 100;
}

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(2, "Give the option a name customers will understand.").max(80),
  // States and towns the option covers; empty means everywhere. Duplicates are dropped.
  regions: z
    .array(z.string().trim().min(1).max(80))
    .max(120, "That's more areas than one option can hold. Leave them all out to deliver everywhere.")
    .transform((list) => list.filter((r, i) => list.findIndex((x) => placeKey(x) === placeKey(r)) === i)),
  fee: z.coerce.number().min(0, "The charge can't be negative.").max(100_000_000),
  weightBands: z
    .array(
      z.object({
        upToKg: z.union([z.number(), z.string(), z.null()]).transform((v) => (v === "" || v === null ? null : Number(v))),
        fee: z.coerce.number().min(0, "A weight band's charge can't be negative.").max(100_000_000),
      }),
    )
    .max(10, "Use up to 10 weight bands.")
    .default([])
    .superRefine((bands, ctx) => {
      let last = 0;
      bands.forEach((b, i) => {
        if (b.upToKg === null) {
          if (i !== bands.length - 1) ctx.addIssue({ code: "custom", message: "Only the last weight band can have no upper weight." });
          return;
        }
        if (!Number.isFinite(b.upToKg) || b.upToKg <= 0) ctx.addIssue({ code: "custom", message: "Each weight band needs a weight above zero." });
        else if (b.upToKg <= last) ctx.addIssue({ code: "custom", message: "Weight bands must go up in weight, each heavier than the one before." });
        else last = b.upToKg;
      });
    }),
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
    weight_bands: input.isPickup ? [] : input.weightBands,
    free_over: input.isPickup ? null : input.freeOver,
    eta_text: input.etaText || null,
    is_pickup: input.isPickup,
    is_active: input.isActive,
  };
}
