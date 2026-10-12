import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Link2, QrCode, Share2, ShieldCheck, Sparkles } from "lucide-react";
import DomainSettings from "@/components/storefront/DomainSettings";
import UpgradePrompt from "@/components/storefront/UpgradePrompt";
import { DashCard, DashPageHeader, DashStatStrip, DashStatTile } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";

export const metadata: Metadata = { title: "Web address" };

export default async function StorefrontDomainPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "domain");
  const plan = await getStorePlan(access.tenantId);
  const customDomain = storeHasFeature(plan, "customDomain");

  return (
    <div className="space-y-6">
      <DashPageHeader title="Web address" description="Where customers find your shop, and how to share it across the web." />

      <DashSectionIntro
        id="domain"
        meaning="marketing"
        art="page"
        title="Your online storefront link"
        points={[
          "Your shop is instantly accessible at your unique XYVOO address, secured with an SSL certificate.",
          "You can change your shop's address anytime, and old links continue redirecting automatically.",
          "Connect a custom domain (e.g., yourbrand.com) on the Standard plan to enhance your brand presence.",
        ]}
      />

      <DashStatStrip label="Domain overview">
        <DashStatTile
          label="Shop subdomain"
          meaning="marketing"
          icon={Globe}
          hint={`${slug}.xyvoo.app`}
          value="Active"
        />
        <DashStatTile
          label="SSL encryption"
          meaning="money"
          icon={ShieldCheck}
          hint="HTTPS secure connection"
          value="Secured"
        />
        <DashStatTile
          label="Custom domain"
          meaning="stock"
          icon={Link2}
          hint={customDomain ? "Supported on your plan" : "Available on Standard"}
          value={customDomain ? "Available" : "Upgrade"}
        />
        <DashStatTile
          label="Share status"
          meaning="orders"
          icon={Share2}
          hint="Direct shop link ready"
          value="Live"
        />
      </DashStatStrip>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          <DomainSettings slug={slug} />
        </div>

        <div className="space-y-6 lg:col-span-5 xl:col-span-4">
          {customDomain ? (
            <DashCard id="own-domain" icon={Link2} meaning="stock" title="Your own domain" description="Use a custom domain for your storefront.">
              <p className="text-sm text-slate-700">
                Your plan includes your own domain. Our team connects it with you, including the security certificate, so it works first time.{" "}
                <Link href="/contact" className="font-medium text-blue-800 underline underline-offset-2">
                  Contact us to connect your domain
                </Link>
                .
              </p>
            </DashCard>
          ) : (
            <UpgradePrompt
              slug={slug}
              title="Use your own domain"
              description="On the Standard plan your shop can use a domain you own, such as www.yourshop.com, with a security certificate included. Your XYVOO address above keeps working too."
            />
          )}

          <DashCard
            id="share-tips"
            icon={Sparkles}
            meaning="marketing"
            title="Grow your shop traffic"
            description="Tips to reach more customers"
          >
            <div className="space-y-2.5 text-sm text-slate-600">
              <p>• Add your shop link to your Instagram, TikTok, and Twitter bios.</p>
              <p>• Share product links directly in WhatsApp chats with buyers.</p>
              <p>• Print your store web address on packaging cards and receipts.</p>
            </div>
          </DashCard>
        </div>
      </div>
    </div>
  );
}
