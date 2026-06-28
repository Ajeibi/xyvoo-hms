import type { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getFolioForReservation, getTenantFolioSettings } from "@/lib/hms/folio";

export type FolioAuth = Exclude<Awaited<ReturnType<typeof requireHotelApiMember>>, { error: string }>;

export async function loadReservation(
  auth: FolioAuth,
  reservationId: string,
) {
  const { data, error } = await auth.service
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,folio_number,status,settlement_method,preauth_amount,total_room_charges,rate_per_night,bill_to_account,po_number,folio_split_notes,commission_plan,commission_value",
    )
    .eq("id", reservationId)
    .eq("tenant_id", auth.tenant.id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function loadFolioPayload(auth: FolioAuth, reservationId: string) {
  const reservation = await loadReservation(auth, reservationId);
  if (!reservation) return null;
  const folio = await getFolioForReservation(auth.service, auth.tenant.id, reservationId, {
    settlementMethod: reservation.settlement_method,
    preauthAmount: reservation.preauth_amount != null ? Number(reservation.preauth_amount) : null,
    totalRoomCharges: Number(reservation.total_room_charges),
    status: reservation.status,
  });
  const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
  return { reservation, folio, settings };
}
