import type { Metadata } from "next";
import ReviewsManager from "@/components/storefront/ReviewsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Reviews" };

export default async function StorefrontReviewsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "reviews");
  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Reviews"
        description="What customers say about what they bought. We ask each customer for a review once their order is delivered."
      />
      <ReviewsManager slug={slug} />
    </div>
  );
}
