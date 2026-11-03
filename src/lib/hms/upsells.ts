import type { SupabaseClient } from "@supabase/supabase-js";
import { UPSELL_KINDS, UPSELL_UNITS, type AcceptedUpsell, type UpsellKind, type UpsellOffer, type UpsellUnit } from "@/lib/hms/upsells-shared";

export * from "@/lib/hms/upsells-shared";

type OfferRow = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  price: number | string;
  unit: string;
  active: boolean;
};

const OFFER_COLUMNS = "id,kind,name,description,price,unit,active";

export function mapOffer(r: OfferRow): UpsellOffer {
  return {
    id: r.id,
    kind: (UPSELL_KINDS as readonly string[]).includes(r.kind) ? (r.kind as UpsellKind) : "other",
    name: r.name,
    description: r.description,
    price: Number(r.price) || 0,
    unit: (UPSELL_UNITS as readonly string[]).includes(r.unit) ? (r.unit as UpsellUnit) : "flat",
    active: r.active,
  };
}

/** The hotel's offers. Empty if the table isn't there yet. */
export async function loadOffers(db: SupabaseClient, tenantId: string, opts: { activeOnly?: boolean } = {}): Promise<UpsellOffer[]> {
  let q = db.schema("hotel").from("upsell_offers").select(OFFER_COLUMNS).eq("tenant_id", tenantId);
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(100);
  if (error || !data) return [];
  return (data as OfferRow[]).map(mapOffer);
}

export async function loadOffer(db: SupabaseClient, tenantId: string, offerId: string): Promise<UpsellOffer | null> {
  const { data } = await db.schema("hotel").from("upsell_offers").select(OFFER_COLUMNS).eq("tenant_id", tenantId).eq("id", offerId).maybeSingle();
  return data ? mapOffer(data as OfferRow) : null;
}

/** What a stay has already accepted, newest first. */
export async function loadStayUpsells(db: SupabaseClient, tenantId: string, reservationId: string): Promise<AcceptedUpsell[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("reservation_upsells")
    .select("id,offer_id,kind,name,amount,accepted_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("accepted_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as { id: string; offer_id: string | null; kind: string; name: string; amount: number | string; accepted_at: string }[]).map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    kind: r.kind,
    name: r.name,
    amount: Number(r.amount) || 0,
    acceptedAt: r.accepted_at,
  }));
}
