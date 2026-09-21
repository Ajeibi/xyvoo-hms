import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoreTenantBySlug } from "@/lib/store/tenants";

export type StoreMembershipRole = "owner" | "admin" | "staff";

export type StoreRoleCapabilities = {
  /** Any recognized member of the store — can view products, orders, and catalog data. */
  canAccess: boolean;
  canManageProducts: boolean;
  canDeleteProducts: boolean;
  canImportProducts: boolean;
  /** Attribute definitions and multi-currency pricing are tenant-wide catalog configuration,
   * not day-to-day product editing — kept to owner/admin the same way HMS keeps chart-of-accounts
   * setup to admin-like roles rather than every department staffer. */
  canManageAttributes: boolean;
  canManagePricing: boolean;
  /** Paystack keys and other tenant-wide storefront settings. */
  canManageSettings: boolean;
};

/** Owner and admin are treated identically for now (both full access); staff is scoped down
 * to day-to-day catalog editing without delete/import/config-level actions. This is the first
 * enforcement of the role tiers that store.memberships has always stored but nothing consumed. */
export function getStoreCapabilities(role: string | null): StoreRoleCapabilities {
  const isOwnerOrAdmin = role === "owner" || role === "admin";
  const isMember = isOwnerOrAdmin || role === "staff";

  return {
    canAccess: isMember,
    canManageProducts: isMember,
    canDeleteProducts: isOwnerOrAdmin,
    canImportProducts: isOwnerOrAdmin,
    canManageAttributes: isOwnerOrAdmin,
    canManagePricing: isOwnerOrAdmin,
    canManageSettings: isOwnerOrAdmin,
  };
}

export type StoreAccessContext = {
  userId: string | null;
  tenantId: string | null;
  role: string | null;
  storeDisplayName: string;
  logoUrl: string | null;
  currentUserName: string;
  homePath: string;
};

function loggedOutContext(slug: string): StoreAccessContext {
  return {
    userId: null,
    tenantId: null,
    role: null,
    storeDisplayName: slug,
    logoUrl: null,
    currentUserName: "Guest",
    homePath: `/auth/login/storefront?from=${encodeURIComponent(`/storefront/${slug}/dashboard`)}`,
  };
}

/**
 * Resolves the caller's access to a storefront tenant by slug. Mirrors
 * getHmsAccessContext's shape/flow but there is only one dashboard role
 * tier for now (any store.memberships row grants full dashboard access) --
 * see /storefront module status for the staff/role-scoping follow-up.
 */
export async function getStoreAccessContext(slug: string): Promise<StoreAccessContext> {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) return loggedOutContext(slug);

  const tenant = await getStoreTenantBySlug(slug);
  if (!tenant) {
    return {
      userId: user.id,
      tenantId: null,
      role: null,
      storeDisplayName: slug,
      logoUrl: null,
      currentUserName: user.email || "User",
      homePath: "/register/storefront",
    };
  }

  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("store")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const storeDisplayName = tenant.display_name?.trim() || tenant.name?.trim() || slug;

  if (!membership) {
    return {
      userId: user.id,
      tenantId: tenant.id,
      role: null,
      storeDisplayName,
      logoUrl: tenant.logo_url || null,
      currentUserName: user.email || "User",
      homePath: "/register/storefront",
    };
  }

  const fullNameFromMetadata =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";

  return {
    userId: user.id,
    tenantId: tenant.id,
    role: membership.role,
    storeDisplayName,
    logoUrl: tenant.logo_url || null,
    currentUserName: fullNameFromMetadata || user.email || "User",
    homePath: `/storefront/${slug}/dashboard`,
  };
}
