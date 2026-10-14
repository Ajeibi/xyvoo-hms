import type { Metadata } from "next";
import ReturnsManager from "@/components/storefront/ReturnsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Returns" };

export default async function StorefrontReturnsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "returns");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Returns" description="Customers ask to send something back. You approve it, receive it, then refund it from the order." />
      <ReturnsManager slug={slug} />
    </div>
  );
}
