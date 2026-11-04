import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getFolioForReservation, insertFolioLine } from "@/lib/hms/folio";
import { addLoyaltyPoints, getGuestLoyalty, getLoyaltySettings } from "@/lib/hms/guest-loyalty";

/*
 * Paying part of a bill with loyalty points. The points leave the guest's ledger and the same
 * amount goes on the bill as a payment, so the balance, the invoice and the night audit all see it
 * as money received. The bill's payer is the booking's primary guest, so that is whose points are used.
 */

export const LOYALTY_REF_PREFIX = "loyalty:";

export type BillLoyalty = {
  enabled: boolean;
  guestId: string | null;
  guestName: string;
  balance: number;
  pointValue: number;
  /** The most points that can go on this bill: their balance, or what is still owed if that is less. */
  maxPoints: number;
  owed: number;
};

async function primaryGuest(service: SupabaseClient, tenantId: string, reservationId: string) {
  const { data: link } = await service
    .schema("hotel")
    .from("reservation_guests")
    .select("guest_id,guests(first_name,last_name,anonymised_at)")
    .eq("reservation_id", reservationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (!link) return null;
  const raw = link.guests as unknown as { first_name: string; last_name: string; anonymised_at?: string | null } | { first_name: string; last_name: string; anonymised_at?: string | null }[] | null;
  const g = Array.isArray(raw) ? raw[0] : raw;
  void tenantId;
  return { id: link.guest_id as string, name: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest", erased: Boolean(g?.anonymised_at) };
}

/** What a guest can spend on this bill right now. */
export async function getBillLoyalty(service: SupabaseClient, tenantId: string, reservationId: string): Promise<BillLoyalty> {
  const none: BillLoyalty = { enabled: false, guestId: null, guestName: "", balance: 0, pointValue: 0, maxPoints: 0, owed: 0 };
  const settings = await getLoyaltySettings(service, tenantId);
  if (!settings.enabled || !(settings.pointValue > 0)) return none;
  const guest = await primaryGuest(service, tenantId, reservationId);
  if (!guest || guest.erased) return none;
  const [loyalty, folio] = await Promise.all([
    getGuestLoyalty(service, tenantId, guest.id, settings),
    getFolioForReservation(service, tenantId, reservationId),
  ]);
  const owed = Math.max(0, Math.round(folio.guestLegBalance * 100) / 100);
  const byBill = Math.floor(owed / settings.pointValue);
  return {
    enabled: true,
    guestId: guest.id,
    guestName: guest.name,
    balance: loyalty.balance,
    pointValue: settings.pointValue,
    maxPoints: Math.max(0, Math.min(loyalty.balance, byBill)),
    owed,
  };
}

export async function redeemPointsOnBill(
  service: SupabaseClient,
  params: { tenantId: string; reservationId: string; actorUserId: string; points: number; currency: string },
): Promise<{ ok: true; amount: number; points: number } | { ok: false; error: string }> {
  const points = Math.trunc(params.points);
  if (!(points > 0)) return { ok: false, error: "Enter how many points to use." };
  const info = await getBillLoyalty(service, params.tenantId, params.reservationId);
  if (!info.enabled || !info.guestId) return { ok: false, error: "Loyalty isn't switched on, or this stay has no guest to take points from." };
  if (points > info.balance) return { ok: false, error: `They only have ${info.balance} points.` };
  if (points > info.maxPoints) return { ok: false, error: info.owed <= 0 ? "There is nothing left to pay on this bill." : `That is more than the bill. At most ${info.maxPoints} points fit.` };

  const amount = Math.round(points * info.pointValue * 100) / 100;
  const spent = await addLoyaltyPoints(service, {
    tenantId: params.tenantId,
    guestId: info.guestId,
    actorUserId: params.actorUserId,
    kind: "redeem",
    points,
    note: "Paid part of a bill with points",
    reservationId: params.reservationId,
  });
  if (!spent.ok) return spent;

  const { line, error } = await insertFolioLine(service, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "payment",
    amount,
    method: "system",
    description: `Paid with loyalty points (${points} points)`,
    postedBy: params.actorUserId,
    reference: `${LOYALTY_REF_PREFIX}${Date.now().toString(36)}`,
    splitLeg: "guest",
    currencyCode: params.currency,
    metadata: { loyaltyPoints: points, pointValue: info.pointValue },
  });
  if (error || !line) {
    // The bill didn't take it, so give the points back.
    await addLoyaltyPoints(service, {
      tenantId: params.tenantId,
      guestId: info.guestId,
      actorUserId: params.actorUserId,
      kind: "adjust",
      points,
      note: "Points returned: the bill could not be updated",
    });
    return { ok: false, error: error ?? "Could not put the payment on the bill." };
  }

  // Tie the redemption to this stay in the ledger history, in the audit trail.
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "loyalty_points_paid_on_bill",
    entityType: "folio_transaction",
    entityId: line.id,
    after: { points, amount, guestId: info.guestId },
  });
  return { ok: true, amount, points };
}
