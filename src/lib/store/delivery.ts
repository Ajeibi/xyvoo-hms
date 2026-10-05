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

/** What the shopper pays for an option on an order of this subtotal. */
export function deliveryFeeFor(zone: Pick<DeliveryZone, "fee" | "freeOver" | "isPickup">, subtotal: number) {
  if (zone.isPickup) return 0;
  if (zone.freeOver != null && subtotal >= zone.freeOver) return 0;
  return zone.fee;
}

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(2, "Give the option a name customers will understand.").max(80),
  regions: z.array(z.string().trim().min(1).max(60)).max(40),
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
