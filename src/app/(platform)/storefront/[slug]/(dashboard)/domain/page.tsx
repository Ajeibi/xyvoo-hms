import type { Metadata } from "next";
import DomainSettings from "@/components/storefront/DomainSettings";

export const metadata: Metadata = { title: "Web address" };

export default async function StorefrontDomainPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Web address</h1>
        <p className="mt-1 text-sm text-slate-500">Where customers find your shop, and how to share it.</p>
      </div>
      <DomainSettings slug={slug} />
    </div>
  );
}
