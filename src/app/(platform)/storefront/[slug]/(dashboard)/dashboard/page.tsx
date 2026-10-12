import type { Metadata } from "next";
import GoLiveChecklist from "@/components/storefront/GoLiveChecklist";
import StorefrontOverview from "@/components/storefront/StorefrontOverview";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { getGoLiveStatus } from "@/lib/store/go-live";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Home",
};

export default async function StorefrontDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  const [status, profile] = access.tenantId
    ? await Promise.all([
        getGoLiveStatus(access.tenantId),
        createServerSupabaseClient().schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
      ])
    : [null, null];

  return (
    <StorefrontOverview
      slug={slug}
      currency={(profile?.data?.currency_code as string | undefined) || "NGN"}
      // Falls back to a plain greeting when all we have is an email address.
      firstName={access.currentUserName.includes("@") ? "" : access.currentUserName.trim().split(/\s+/)[0] || ""}
      live={status?.status === "live"}
      checklist={
        status ? (
          <GoLiveChecklist
            slug={slug}
            initial={status}
            canManage={getStoreCapabilities(access.role).canManageSettings}
            // The path-based address works everywhere; the subdomain needs Vercel's wildcard domain set up.
            liveUrl={`/shop/${slug}`}
          />
        ) : null
      }
    />
  );
}
