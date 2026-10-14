import type { Metadata } from "next";
import { Clock, MapPin, Sparkles, Truck } from "lucide-react";
import DeliveryManager from "@/components/storefront/DeliveryManager";
import FreeDeliveryRules from "@/components/storefront/FreeDeliveryRules";
import { DashPageHeader, DashStatStrip, DashStatTile } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Delivery",
};

export default async function StorefrontDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "delivery");
  const { data } = access.tenantId
    ? await createServerSupabaseClient().schema("store").from("business_profile").select("currency_code, country_code").eq("tenant_id", access.tenantId).maybeSingle()
    : { data: null };
  // Weight bands only price what has a weight, so say how many products would count as nothing.
  const { count: unweighed } = access.tenantId
    ? await createServerSupabaseClient()
        .schema("store")
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", access.tenantId)
        .neq("status", "archived")
        .or("weight_kg.is.null,weight_kg.eq.0")
    : { count: 0 };

  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Delivery"
        description="The delivery options customers choose from at checkout, what each costs, and when delivery is free."
      />

      <DashSectionIntro
        id="delivery"
        meaning="orders"
        art="truck"
        title="Get orders to your customers"
        points={[
          "Add delivery zones and flat rates for states, cities, or custom regions where you ship.",
          "Enable store pickup if customers can collect their orders directly from your physical location.",
          "Set up a free delivery threshold to encourage customers to add more items to their cart.",
        ]}
      />

      <DashStatStrip label="Delivery overview">
        <DashStatTile
          label="Shipping zones"
          meaning="orders"
          icon={MapPin}
          hint="Regional rates configured"
          value="Custom rates"
        />
        <DashStatTile
          label="Free delivery"
          meaning="marketing"
          icon={Sparkles}
          hint="Automatic cart threshold"
          value="Available"
        />
        <DashStatTile
          label="Estimated times"
          meaning="orders"
          icon={Clock}
          hint="Shown on checkout"
          value="Enabled"
        />
        <DashStatTile
          label="Store pickup"
          meaning="stock"
          icon={Truck}
          hint="In-person collection"
          value="Supported"
        />
      </DashStatStrip>

      <DeliveryManager slug={slug} unweighedProducts={unweighed ?? 0} currency={(data?.currency_code as string) || "NGN"} countryCode={(data?.country_code as string) || "NG"} />
      <FreeDeliveryRules slug={slug} currency={(data?.currency_code as string) || "NGN"} countryCode={(data?.country_code as string) || "NG"} />
    </div>
  );
}
