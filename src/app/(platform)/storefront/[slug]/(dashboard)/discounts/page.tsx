import type { Metadata } from "next";
import DiscountsManager from "@/components/storefront/DiscountsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Discounts" };

export default async function StorefrontDiscountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "discounts");
  const { data } = access.tenantId
    ? await createServerSupabaseClient().schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <DashPageHeader title="Discounts" description="Codes customers type at checkout for money off: for a sale, a thank-you, or to bring someone back." />
      <DiscountsManager slug={slug} currency={(data?.currency_code as string) || "NGN"} />
    </div>
  );
}
