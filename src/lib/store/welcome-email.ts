import { EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendStoreWelcomeEmail } from "@/lib/mail/mailtrap";
import { storefrontUrl } from "@/lib/store/subdomain";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Sends the store welcome email to someone who has just confirmed their email
 * address, if they own a store. Hotel (HMS) accounts and staff members invited
 * to a store don't get it. Never throws: a failed welcome email mustn't stop
 * anyone signing in, so failures are logged instead.
 */
export async function sendStoreWelcomeEmailFor(user: { id: string; email: string; fullName: string | null }) {
  try {
    const db = createServerSupabaseClient();
    const { data: membership } = await db
      .schema("store")
      .from("memberships")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!membership) return;

    const { data: tenant } = await db
      .from("tenants")
      .select("subdomain, name, display_name")
      .eq("id", membership.tenant_id)
      .eq("product", "store")
      .maybeSingle();
    const slug = (tenant?.subdomain as string | null) || (tenant?.name as string | null);
    if (!tenant || !slug) return;

    await sendStoreWelcomeEmail({
      to: user.email,
      name: user.fullName,
      storeName: (tenant.display_name as string | null)?.trim() || slug,
      dashboardUrl: `${EMAIL_SITE_URL}/storefront/${slug}/dashboard`,
      shopUrl: storefrontUrl(slug),
      signInUrl: `${EMAIL_SITE_URL}/auth/login/storefront`,
      resetPasswordUrl: `${EMAIL_SITE_URL}/auth/forgot-password?for=storefront`,
    });
  } catch (error) {
    console.error("[store welcome email] not sent", { userId: user.id, error });
  }
}
