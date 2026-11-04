import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { canEditGuests, canManageGuests } from "@/lib/hms/guest-access";
import type { CompanyOption } from "@/lib/hms/guest-fields";

/** The companies a guest can be linked to (the customers in Accounts that are still active). */
export async function listCompanyOptions(tenantId: string): Promise<CompanyOption[]> {
  const { data } = await createServerSupabaseClient()
    .schema("hotel")
    .from("ar_customers")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name");
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string }));
}

/** What every guest screen needs to know about the hotel and the person looking at it. */
export async function loadGuestPageContext(slug: string) {
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  if (!tenant) return null;
  const role = access.role ?? "Front Desk";
  return {
    tenant,
    access,
    currency: normalizePricingSetup(tenant.pricing_setup).currency,
    canEdit: canEditGuests(role),
    canManage: canManageGuests(role, access.departmentRole),
  };
}
