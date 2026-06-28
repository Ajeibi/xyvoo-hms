import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export async function resolveReservationGuestEmail(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
  fallback?: string,
): Promise<string> {
  const { data: links } = await supabase
    .schema("hotel")
    .from("reservation_guests")
    .select("is_primary, guests(email)")
    .eq("reservation_id", reservationId);

  const rows = (links ?? []) as unknown as {
    is_primary: boolean;
    guests: { email: string | null } | { email: string | null }[] | null;
  }[];

  const guestEmail = (g: { email: string | null } | { email: string | null }[] | null) => {
    if (!g) return null;
    if (Array.isArray(g)) return g[0]?.email ?? null;
    return g.email;
  };

  const primary = rows.find((r) => r.is_primary);
  const primaryEmail = guestEmail(primary?.guests ?? null);
  if (primaryEmail?.trim()) return primaryEmail.trim();
  const any = rows.map((r) => guestEmail(r.guests)).find((e) => e?.trim());
  if (any?.trim()) return any.trim();
  if (fallback?.trim()) return fallback.trim();
  return `guest+${reservationId.slice(0, 8)}@xyvoo.local`;
}

export function tenantCurrency(tenant: { pricing_setup?: unknown }): string {
  return normalizePricingSetup(tenant.pricing_setup).currency;
}
