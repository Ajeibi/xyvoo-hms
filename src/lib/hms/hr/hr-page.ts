import type { SupabaseClient } from "@supabase/supabase-js";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { canSeeHrPrivate, privateHrClient } from "@/lib/hms/hr/hr-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HrPageContext = {
  tenantId: string;
  service: SupabaseClient;
  privateDb: SupabaseClient;
  canSeePrivate: boolean;
  isOwner: boolean;
  userId: string | null;
};

/** What every HR screen needs. The page itself is gated by HMSLayout's "hr" section. */
export async function loadHrPage(slug: string): Promise<HrPageContext | null> {
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  if (!tenant || !access.userId) return null;
  const privateDb = await privateHrClient();
  const canSeePrivate = await canSeeHrPrivate(privateDb, tenant.id);
  return {
    tenantId: tenant.id,
    service: createServerSupabaseClient(),
    privateDb,
    canSeePrivate,
    isOwner: access.role === "owner",
    userId: access.userId,
  };
}
