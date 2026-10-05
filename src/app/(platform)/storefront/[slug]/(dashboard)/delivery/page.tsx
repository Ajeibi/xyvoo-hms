import DeliveryManager from "@/components/storefront/DeliveryManager";
import { getStoreAccessContext } from "@/lib/store/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function StorefrontDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  const { data } = access.tenantId
    ? await createServerSupabaseClient().schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle()
    : { data: null };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Delivery</h1>
        <p className="mt-1 text-sm text-slate-500">The delivery options customers choose from at checkout, and what each costs.</p>
      </div>
      <DeliveryManager slug={slug} currency={(data?.currency_code as string) || "NGN"} />
    </div>
  );
}
