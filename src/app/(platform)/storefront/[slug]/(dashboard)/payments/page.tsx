import PayoutAccountCard from "@/components/storefront/PayoutAccountCard";
import PlanBillingCard from "@/components/storefront/PlanBillingCard";
import StorefrontSettingsClient from "@/components/storefront/StorefrontSettingsClient";
import { getStoreAccessContext } from "@/lib/store/access";
import { getTenantPaystackSetup } from "@/lib/shop/tenants";

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  // Only stores that already entered their own Paystack keys still see that form.
  const hasOwnKeys = access.tenantId ? Boolean(await getTenantPaystackSetup(access.tenantId)) : false;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Payments and plan</h1>
        <p className="mt-1 text-sm text-slate-500">Where your sales are paid, and what XYVOO charges.</p>
      </div>
      <PayoutAccountCard slug={slug} />
      <PlanBillingCard slug={slug} />
      {hasOwnKeys ? <StorefrontSettingsClient slug={slug} /> : null}
    </div>
  );
}
