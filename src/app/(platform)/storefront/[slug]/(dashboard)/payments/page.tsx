import type { Metadata } from "next";
import { Coins, CreditCard, HandCoins, Landmark, ShieldCheck, Zap } from "lucide-react";
import CurrenciesCard from "@/components/storefront/CurrenciesCard";
import OfflinePaymentsCard from "@/components/storefront/OfflinePaymentsCard";
import PaymentsSummary from "@/components/storefront/PaymentsSummary";
import PayoutAccountCard from "@/components/storefront/PayoutAccountCard";
import PlanBillingCard from "@/components/storefront/PlanBillingCard";
import StorefrontSettingsClient from "@/components/storefront/StorefrontSettingsClient";
import TaxSettingsCard from "@/components/storefront/TaxSettingsCard";
import UpgradePrompt from "@/components/storefront/UpgradePrompt";
import { DashCard, DashPageHeader, DashStatStrip, DashStatTile } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";
import { getTenantPaystackSetup } from "@/lib/shop/tenants";

export const metadata: Metadata = {
  title: "Payments and plan",
};

export default async function StorefrontPaymentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "payments");
  // Only stores that already entered their own Paystack keys still see that form.
  const [ownKeys, plan] = await Promise.all([getTenantPaystackSetup(access.tenantId), getStorePlan(access.tenantId)]);
  const hasOwnKeys = Boolean(ownKeys);

  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Payments and plan"
        description="How customers pay you, where the money goes, the currencies they see, and what XYVOO charges."
      />

      <DashSectionIntro
        id="payments"
        meaning="money"
        art="chart"
        title="Accept payments seamlessly"
        points={[
          "Card and bank payments are processed securely via Paystack and settled automatically into your verified bank account.",
          "Enable alternative payment options like Bank Transfer, Pay on Delivery, and WhatsApp ordering.",
          "Manage supported customer display currencies, local VAT/tax rates, and your XYVOO subscription plan.",
        ]}
      />

      <DashStatStrip label="Payment settings overview">
        <DashStatTile
          label="Card payouts"
          meaning="money"
          icon={Landmark}
          hint="Direct to your bank account"
          value="Automated"
          href="#get-paid"
        />
        <DashStatTile
          label="Alternative methods"
          meaning="orders"
          icon={HandCoins}
          hint="Transfer, POD & WhatsApp"
          value="Configurable"
          href="#other-ways-to-pay"
        />
        <DashStatTile
          label="Display currencies"
          meaning="stock"
          icon={Coins}
          hint="Multi-currency prices"
          value="Customisable"
          href="#currencies"
        />
        <DashStatTile
          label="Platform billing"
          meaning="marketing"
          icon={CreditCard}
          hint="Plan features & fees"
          value={plan === "standard" ? "Standard" : plan === "enterprise" ? "Enterprise" : "Free plan"}
          href="#plan-and-fees"
        />
      </DashStatStrip>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Main Settings Column */}
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          <div id="get-paid" className="scroll-mt-6">
            <PayoutAccountCard slug={slug} />
          </div>

          <div id="other-ways-to-pay" className="scroll-mt-6">
            <OfflinePaymentsCard slug={slug} />
          </div>

          <div id="currencies" className="scroll-mt-6">
            {storeHasFeature(plan, "multiCurrency") ? (
              <CurrenciesCard slug={slug} />
            ) : (
              <UpgradePrompt
                slug={slug}
                title="Show prices in other currencies"
                description="On the Standard plan, customers can see your prices in dollars, pounds, cedis and more, while still paying in your own currency. Any currencies you chose before are kept for when you upgrade."
              />
            )}
          </div>

          <div id="tax" className="scroll-mt-6">
            <TaxSettingsCard slug={slug} />
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="space-y-6 lg:col-span-5 xl:col-span-4">
          <div id="how-paid" className="scroll-mt-6">
            <PaymentsSummary slug={slug} hasOwnKeys={hasOwnKeys} />
          </div>

          <div id="plan-and-fees" className="scroll-mt-6">
            <PlanBillingCard slug={slug} />
          </div>

          {hasOwnKeys ? (
            <div id="own-paystack-keys" className="scroll-mt-6">
              <StorefrontSettingsClient slug={slug} />
            </div>
          ) : null}

          {/* Trust & Security Guarantee Card */}
          <DashCard
            id="security-guarantee"
            icon={ShieldCheck}
            meaning="money"
            title="Safe & secure payments"
            description="Protected by industry-grade infrastructure"
          >
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>
                  <strong className="font-semibold text-slate-900">Direct Paystack Settlements:</strong> Card payments go straight into your bank account according to Paystack&rsquo;s settlement schedule.
                </p>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p>
                  <strong className="font-semibold text-slate-900">PCI-DSS Level 1 Certified:</strong> All sensitive customer card details are encrypted and processed securely.
                </p>
              </div>
            </div>
          </DashCard>
        </div>
      </div>
    </div>
  );
}
