import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OrderDetailView from "@/components/storefront/OrderDetail";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";
import { loadOrderDetail } from "@/lib/store/order-detail";
import { orderRef } from "@/lib/store/orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ orderId: string }> }): Promise<Metadata> {
  const { orderId } = await params;
  return { title: `Order ${orderRef(orderId)}` };
}

export default async function StorefrontOrderPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  const access = await getStoreAccessContext(slug);
  if (!access.tenantId || !access.role) notFound();

  const { data: profile } = await createServerSupabaseClient()
    .schema("store")
    .from("business_profile")
    .select("currency_code, country_code")
    .eq("tenant_id", access.tenantId)
    .maybeSingle();
  const detail = await loadOrderDetail(access.tenantId, orderId, (profile?.currency_code as string | undefined) || "NGN");
  if (!detail) notFound();

  return (
    <OrderDetailView
      slug={slug}
      detail={detail}
      countryCode={(profile?.country_code as string | undefined) || "NG"}
      canRefund={getStoreCapabilities(access.role).canManageSettings}
    />
  );
}
