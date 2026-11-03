/* Browser-safe parts of upsells: kinds, pricing for a stay and wording. */

export const UPSELL_KINDS = ["room_upgrade", "late_checkout", "breakfast", "other"] as const;
export type UpsellKind = (typeof UPSELL_KINDS)[number];

export const UPSELL_KIND_LABELS: Record<UpsellKind, string> = {
  room_upgrade: "Room upgrade",
  late_checkout: "Late check-out",
  breakfast: "Breakfast",
  other: "Other extra",
};

export const UPSELL_UNITS = ["flat", "per_night", "per_person_night"] as const;
export type UpsellUnit = (typeof UPSELL_UNITS)[number];

export const UPSELL_UNIT_LABELS: Record<UpsellUnit, string> = {
  flat: "once per stay",
  per_night: "each night",
  per_person_night: "each adult, each night",
};

export type UpsellOffer = {
  id: string;
  kind: UpsellKind;
  name: string;
  description: string | null;
  price: number;
  unit: UpsellUnit;
  active: boolean;
};

export type AcceptedUpsell = {
  id: string;
  offerId: string | null;
  kind: string;
  name: string;
  amount: number;
  acceptedAt: string;
};

/** What an offer costs for this stay, rounded to kobo. */
export function upsellAmount(offer: Pick<UpsellOffer, "price" | "unit">, stay: { nights: number; adults: number }): number {
  const nights = Math.max(1, Math.floor(stay.nights) || 1);
  const adults = Math.max(1, Math.floor(stay.adults) || 1);
  const factor = offer.unit === "flat" ? 1 : offer.unit === "per_night" ? nights : nights * adults;
  return Math.round(offer.price * factor * 100) / 100;
}

/** The line on the bill, e.g. "Breakfast (2 nights, 2 adults)". */
export function upsellDescription(offer: Pick<UpsellOffer, "name" | "unit">, stay: { nights: number; adults: number }): string {
  const nights = Math.max(1, Math.floor(stay.nights) || 1);
  const adults = Math.max(1, Math.floor(stay.adults) || 1);
  const night = `${nights} night${nights === 1 ? "" : "s"}`;
  if (offer.unit === "flat") return offer.name;
  if (offer.unit === "per_night") return `${offer.name} (${night})`;
  return `${offer.name} (${night}, ${adults} adult${adults === 1 ? "" : "s"})`;
}
