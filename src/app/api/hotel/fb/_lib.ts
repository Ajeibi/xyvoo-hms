import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HotelTenantBySlugRow } from "@/types";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { assertFbCapability, getFbCapabilities, type FbRoleCapabilities } from "@/lib/hms/fb-rbac";

export type FbApiAuth = {
  user: User;
  tenant: HotelTenantBySlugRow;
  service: SupabaseClient;
  role: string;
  departmentRole: string | null;
  capabilities: FbRoleCapabilities;
};

export type FbApiError = { error: string; status: number };

export async function requireFbApi(slug: string): Promise<FbApiAuth | FbApiError> {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) {
    return { error: auth.error ?? "Forbidden", status: auth.status ?? 403 };
  }

  const departmentRole =
    typeof auth.user.user_metadata?.department_role === "string"
      ? auth.user.user_metadata.department_role
      : null;

  const capabilities = getFbCapabilities(auth.role, departmentRole);

  return {
    user: auth.user,
    tenant: auth.tenant,
    service: auth.service,
    role: auth.role,
    departmentRole,
    capabilities,
  };
}

export function fbForbidden(caps: FbRoleCapabilities, key: Parameters<typeof assertFbCapability>[1]) {
  const msg = assertFbCapability(caps, key);
  if (msg) return { error: msg, status: 403 as const };
  return null;
}
