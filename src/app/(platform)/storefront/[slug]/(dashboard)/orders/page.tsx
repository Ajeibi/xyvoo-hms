import type { Metadata } from "next";
import StorefrontOrders from "@/components/storefront/StorefrontOrders";
import { getStoreAccessContext } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Orders",
};

export default async function StorefrontOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ show?: string | string[]; status?: string | string[] }>;
}) {
  const [{ slug }, { show, status }] = await Promise.all([params, searchParams]);
  const access = await getStoreAccessContext(slug);
  const [profile, plan] = access.tenantId
    ? await Promise.all([
        createServerSupabaseClient().schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
        getStorePlan(access.tenantId),
      ])
    : [null, null];
  // ?show=to-send and ?show=to-confirm come from the Home page; ?status= from this page's own address.
  const initial = typeof status === "string" ? status : typeof show === "string" ? show : undefined;
  return (
    <StorefrontOrders
      slug={slug}
      currency={(profile?.data?.currency_code as string | undefined) || "NGN"}
      initialFilter={initial}
      canExport={storeHasFeature(plan, "exports")}
    />
  );
}
