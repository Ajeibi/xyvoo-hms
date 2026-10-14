import { cache } from "react";
import { redirect } from "next/navigation";
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
  /** Inviting people, changing their roles and removing them. */
  canManageTeam: boolean;
  /** The activity log: who changed what. */
  canViewActivity: boolean;
  /** Sales figures: analytics and abandoned carts. */
  canViewReports: boolean;
};

/** Owner and admin both have full access (the owner differs only in that admins can't remove or
 * demote them); staff is scoped down to day-to-day selling: orders, products, collections and
 * customers, without delete/import/config-level actions. */
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
    canManageTeam: isOwnerOrAdmin,
    canViewActivity: isOwnerOrAdmin,
    canViewReports: isOwnerOrAdmin,
  };
}

/** Dashboard sections, by the key the sidebar uses. */
export const STORE_SECTIONS = [
  "dashboard",
  "orders",
  "products",
  "collections",
  "customers",
  "discounts",
  "gift-cards",
  "campaigns",
  "loyalty",
  "referrals",
  "returns",
  "trade",
  "blog",
  "reviews",
  "analytics",
  "abandoned-carts",
  "notifications",
  "website",
  "domain",
  "delivery",
  "payments",
  "settings",
  "team",
  "activity",
  "alerts",
] as const;
export type StoreSection = (typeof STORE_SECTIONS)[number];

/** What staff can open: the day-to-day selling screens. Everything else is for owners and admins. */
const STAFF_SECTIONS: readonly StoreSection[] = ["dashboard", "orders", "returns", "products", "collections", "customers", "reviews", "alerts"];

export function canUseStoreSection(role: string | null, section: StoreSection) {
  if (role === "owner" || role === "admin") return true;
  return role === "staff" && STAFF_SECTIONS.includes(section);
}

export const STORE_ROLE_LABELS: Record<StoreMembershipRole, string> = { owner: "Owner", admin: "Admin", staff: "Staff" };

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
 * Resolves the caller's access to a storefront tenant by slug: the signed-in
 * user and their role from store.memberships. The role is read from the
 * database on every request (React's cache() lasts one request only), so
 * removing someone or changing their role takes effect on their next click.
 * Do not add a longer-lived cache here.
 */
export const getStoreAccessContext = cache(loadStoreAccessContext);

/**
 * For dashboard pages a role can't use: sends anyone without access back to
 * Home (or to sign in), so the page never renders for them. The APIs behind
 * each page check the role too.
 */
export async function requireStoreSection(slug: string, section: StoreSection) {
  const access = await getStoreAccessContext(slug);
  if (!access.userId || !access.tenantId || !access.role) redirect(access.homePath);
  if (!canUseStoreSection(access.role, section)) redirect(`/storefront/${slug}/dashboard`);
  return access as StoreAccessContext & { userId: string; tenantId: string; role: string };
}

async function loadStoreAccessContext(slug: string): Promise<StoreAccessContext> {
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
