import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Globe, Palette, ShieldCheck, Sparkles, Store } from "lucide-react";
import StoreDetailsForm from "@/components/storefront/StoreDetailsForm";
import { DashCard, DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { getStoreAccessContext, requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = {
  title: "Store details",
};

export default async function StorefrontSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "settings");

  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Store details"
        description="Your store’s name, contact details, and business information customers see."
      />

      <DashSectionIntro
        id="settings"
        meaning="neutral"
        art="page"
        title="Manage your storefront profile"
        points={[
          "Your business name and tagline appear across your online shop, emails, invoices, and checkout.",
          "Keep contact details up to date so customers and the XYVOO support team can reach you easily.",
          "Social links help your visitors connect with your community on Instagram, TikTok, and WhatsApp.",
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Main Details Form */}
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          <StoreDetailsForm slug={slug} />
        </div>

        {/* Sidebar Help & Links */}
        <div className="space-y-6 lg:col-span-5 xl:col-span-4">
          <DashCard
            id="store-quick-links"
            icon={Store}
            meaning="stock"
            title="Storefront shortcuts"
            description="Related store customization"
          >
            <div className="space-y-3">
              <Link
                href={`/shop/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                <span className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-blue-600" />
                  Preview live shop
                </span>
                <ExternalLink className="h-4 w-4 text-slate-400" />
              </Link>

              <Link
                href={`/storefront/${slug}/website`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                <span className="flex items-center gap-2.5">
                  <Palette className="h-4 w-4 text-purple-600" />
                  Customize shop theme
                </span>
                <span className="text-xs text-slate-500">Website editor</span>
              </Link>

              <Link
                href={`/storefront/${slug}/domain`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Custom web address
                </span>
                <span className="text-xs text-slate-500">Domain settings</span>
              </Link>
            </div>
          </DashCard>

          <DashCard
            id="brand-protection"
            icon={ShieldCheck}
            meaning="neutral"
            title="Verified Merchant Profile"
            description="Built on XYVOO secure cloud"
          >
            <p className="text-sm text-slate-600">
              Your store details and customer communications are authenticated and secured with TLS encryption.
            </p>
          </DashCard>
        </div>
      </div>
    </div>
  );
}
