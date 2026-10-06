import type { Metadata } from "next";
import AbandonedCarts from "@/components/storefront/AbandonedCarts";

export const metadata: Metadata = { title: "Abandoned carts" };

export default async function StorefrontAbandonedCartsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Abandoned carts</h1>
        <p className="mt-1 text-sm text-slate-500">Shoppers who started checkout but didn&rsquo;t pay. Follow up with a friendly message.</p>
      </div>
      <AbandonedCarts slug={slug} />
    </div>
  );
}
