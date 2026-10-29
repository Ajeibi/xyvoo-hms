import type { SupabaseClient } from "@supabase/supabase-js";

export { creditLimitState, guestOwes, type CreditLimitState } from "@/lib/hms/folio-credit-limits-shared";

/** Give a stay its own credit limit, or clear it (null) so the hotel's default applies. */
export async function setStayCreditLimit(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; limit: number | null },
): Promise<{ ok: true; before: number | null } | { ok: false; error: string }> {
  const { data: res } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("status,credit_limit")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();
  if (!res) return { ok: false, error: "Reservation not found." };
  if (res.status === "checked_out" || res.status === "cancelled") {
    return { ok: false, error: "This stay is closed, so its limit can't change." };
  }
  const { error } = await supabase
    .schema("hotel")
    .from("reservations")
    .update({ credit_limit: params.limit })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, before: res.credit_limit != null ? Number(res.credit_limit) : null };
}
