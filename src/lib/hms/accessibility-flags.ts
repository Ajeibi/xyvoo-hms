import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanFlags, mergeFlags, type AccessibilityFlag } from "@/lib/hms/accessibility-flags-shared";

export * from "@/lib/hms/accessibility-flags-shared";

export type StayAccessibility = {
  stayFlags: AccessibilityFlag[];
  guestFlags: AccessibilityFlag[];
  guestId: string | null;
};

type GuestLink = { is_primary: boolean | null; guests: { id: string; accessibility_flags?: string[] | null } | { id: string; accessibility_flags?: string[] | null }[] | null };

/** A stay's flags and its main guest's saved ones. Empty if the columns aren't there yet. */
export async function loadStayAccessibility(db: SupabaseClient, tenantId: string, reservationId: string): Promise<StayAccessibility> {
  const empty: StayAccessibility = { stayFlags: [], guestFlags: [], guestId: null };
  const { data, error } = await db
    .schema("hotel")
    .from("reservations")
    .select("accessibility_flags,reservation_guests(is_primary,guests(id,accessibility_flags))")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error || !data) return empty;
  const links = ((data as { reservation_guests?: GuestLink[] | null }).reservation_guests ?? []) as GuestLink[];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = Array.isArray(link?.guests) ? link?.guests[0] : link?.guests;
  return {
    stayFlags: cleanFlags((data as { accessibility_flags?: unknown }).accessibility_flags),
    guestFlags: cleanFlags(g?.accessibility_flags),
    guestId: g?.id ?? null,
  };
}

/** Everyone arriving or in the house who has a flag, by booking, for the desk's lists. */
export async function loadActiveAccessibility(db: SupabaseClient, tenantId: string): Promise<Record<string, AccessibilityFlag[]>> {
  const { data, error } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,accessibility_flags,reservation_guests(is_primary,guests(accessibility_flags))")
    .eq("tenant_id", tenantId)
    .in("status", ["confirmed", "checked_in"])
    .limit(1000);
  if (error || !data) return {};
  const out: Record<string, AccessibilityFlag[]> = {};
  for (const r of data as unknown as { id: string; accessibility_flags?: unknown; reservation_guests?: GuestLink[] | null }[]) {
    const links = r.reservation_guests ?? [];
    const link = links.find((l) => l.is_primary) ?? links[0];
    const g = Array.isArray(link?.guests) ? link?.guests[0] : link?.guests;
    const flags = mergeFlags(r.accessibility_flags, g?.accessibility_flags);
    if (flags.length > 0) out[r.id] = flags;
  }
  return out;
}
